/**
 * Interface for accessing the MonitorChain smart contract methods
 * Copyright (C) 2018,  Zenchain Group Inc.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

const Web3js = require('web3');
const HDWalletProvider = require('truffle-hdwallet-provider');
const EventEmitter = require('events');
const net = require('net');
const Mutex = require('await-semaphore').Mutex;
const extend = require('xtend');
const monitor = require('./AccessInterface');
const erc20 = require('./ERC20');
const bn = require('big-integer');

EventEmitter.defaultMaxListeners = 5000;

let log;
try {
    const logger = require('./logger');
    log = logger(module);
} catch (e) {
    if(e.code !== 'MODULE_NOT_FOUND') throw(e);
    const isDebug = process.env.LOG_LEVEL === 'debug';
    log = new Proxy({}, {
        get: function (obj, prop) {
            return function(message) {
                message = `[${(new Date()).toISOString()}] [${prop}] ${message}`;
                if(isDebug) console.log(message)
            }
        }
    })
}

const returnValue = (err, result, callback) => {
    if (typeof callback === 'function') {
        return callback(err, result)
    }
    if (err) throw err;
    return result
};

const toChecksum = (address) => {
    return Web3js.utils.toChecksumAddress(address)
};


const toWei = (amount, unit) => {
    return Web3js.utils.toWei(amount.toString(), unit);
};


const fromWei = (amount, unit) => {
    return Web3js.utils.fromWei(amount.toString(), unit);
};


function _to (promise) {
    return promise
        .then(data => [null, data])
        .catch(err => [err, null]);
}

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const transactions = {
    tx: [],
    totalGasUsed: bn.zero,
    totalEthSpent: 0,
    _lockMap: {},
    _idCounter: Math.round(Math.random() * Number.MAX_SAFE_INTEGER),
    addTx: function(args) {
        args.id = args.id || this._createRandomId();
        args.time = (new Date()).getTime();
        args.status = args.status || 'pending';
        this.tx.push(args);
        return args.id;
    },

    getFailedTransactions: function getFailedTransactions(address) {
        const filter = {status: 'failed'};
        if(address) filter.address  = address;
        return this.getFilteredTxList(filter)
    },

    getConfirmedTransactions: function getConfirmedTransactions(address) {
        const filter = {status: 'confirmed'};
        if(address) filter.address  = address;
        return this.getFilteredTxList(filter)
    },

    getPendingTransactions: function getPendingTransactions(address) {
        const filter = {status: 'pending'};
        if(address) filter.address  = address;
        return this.getFilteredTxList(filter)
    },

    getSubmittedTransactions: function getSubmittedTransactions(address) {
        const filter = {status: 'submitted'};
        if(address) filter.address  = address;
        return this.getFilteredTxList(filter)
    },

    getFilteredTxList: function getFilteredTxList(opts, initialList) {
        let filteredTxList = initialList;
        Object.keys(opts).forEach((key) => {
            filteredTxList = this.getTxsByMetaData(key, opts[key], filteredTxList)
        });
        return filteredTxList
    },

    getTxsByMetaData: function getTxsByMetaData(key, value, txList = this.tx) {
        return txList.filter(txMeta => txMeta[key] === value)
    },

    updateTx: function updateTx(txMeta) {
        const index = this.tx.findIndex(tx => tx.id === txMeta.id);
        log.debug(`updateTx: ${txMeta.id} -> ${index} -> ${JSON.stringify(txMeta)}`);
        this.tx[index] = txMeta;
    },

    getTxMeta: async function getTxMeta() {
        const args = [].slice.call(arguments);
        const obj = args.shift();
        const method = args.shift();

        const lastArg = args[args.length - 1];
        const lastArgType = typeof lastArg;
        const isObject = (lastArgType === 'function' || lastArgType === 'object' && !!lastArg) && !Array.isArray(lastArg);

        let options = {};
        if(isObject) {
            options = args.pop();
        }
        options.from = options.from || obj.wallet;
        let txType;

        if(obj._sent.includes(method)) {
            options.gas = options.gas || obj.gasLimit || '6000000';
            options.gasPrice = options.gasPrice || obj.gasPrice;
            const gasPrice = await obj.w3.eth.getGasPrice();
            if(!options.gasPrice) {
                options.gasPrice = Math.ceil(parseInt(gasPrice) * 1.2);
            } else if(parseInt(gasPrice) > options.gasPrice) {
                log.warn(`the gas price is too low: blockchain - ${fromWei(gasPrice, 'gwei')}, TxObject - ${fromWei(options.gasPrice, 'gwei')} (GWEI)`)
            }
            txType = 'send';
        } else if(obj._call.includes(method)){
            txType = 'call';
        }

        return {
            address: options.from,
            method: method,
            methodArgs: args,
            options: options,
            txType: txType
        }
    },

    getNonce: async function getNonce(obj) {
        const address = obj.wallet;
        const releaseNonceLock = await this._getLock(address);
        try {
            const block = await obj.w3.eth.getBlock('latest');
            const blockNumber = block.number;
            const nextNetworkNonce = await obj.w3.eth.getTransactionCount(address, blockNumber);
            const highestLocallyConfirmed = this._getHighestLocallyConfirmed(address);

            const highestSuggested = Math.max(nextNetworkNonce, highestLocallyConfirmed);

            const pendingTxs = this.getSubmittedTransactions(address);
            const localNonceResult = this._getHighestContinuousFrom(pendingTxs, highestSuggested) || 0;

            const nonceDetails = {
                localNonceResult,
                highestLocallyConfirmed,
                highestSuggested,
                nextNetworkNonce,
            };

            const nextNonce = Math.max(nextNetworkNonce, localNonceResult);

            const data = { nextNonce, nonceDetails, releaseNonceLock };
            log.debug(`getNonce: ${JSON.stringify(nonceDetails)}`);

            return data

        } catch (err) {
            log.error(`getNonce error: ${err}`);
            releaseNonceLock();
            throw err
        }

    },

    submitTx: async function sendTx(obj, txMeta, lock=false) {
        let err, result, releaseTxLock;

        const { method, methodArgs, options, txType } = txMeta;
        if(txType === 'call') {
            [err, result] = await _to(obj.contract.methods[method](...methodArgs).call(options));
            return [err, result]
        }
        log.debug(JSON.stringify(this.getTxStat('submitTxIN')));

        await this._globalLockFree();
        releaseTxLock = lock ? await this._getLock(txMeta.address) : () => {};

        txMeta.id = this.addTx(txMeta);

        let { nextNonce, nonceDetails, releaseNonceLock } = await this.getNonce(obj);
        let awaiting = this.getSubmittedTransactions().length;
        let pending = this.getPendingTransactions().length;
        const awaitLimit = 100;
        const awaitTime = 10; //seconds
        if(txType === 'send' && awaiting >= awaitLimit) {
            while(awaiting > awaitLimit) {
                log.debug(`Too many transactions are waiting to be mined: submitted - ${awaiting}, pending - ${pending}, sleeping ${awaitTime} seconds...`);
                await sleep(awaitTime * 1000);
                awaiting = this.getSubmittedTransactions().length;
                pending = this.getPendingTransactions().length;
            }
        }

        try {
            if(txType === 'send') {
                txMeta.nonce = nextNonce;
                txMeta.status = 'submitted';
                this.updateTx(txMeta);

                options.nonce = nextNonce;
                releaseNonceLock();
                log.debug(JSON.stringify({
                    id: txMeta.id,
                    contractAddress: obj.address,
                    method: method,
                    args: methodArgs,
                    options: options,
                    nonceDetails: nonceDetails,
                    submitSendTxMeta: txMeta
                }));
                log.debug(JSON.stringify(this.getTxStat(txMeta.id)));

                try {
                    result = await obj.contract.methods[method](...methodArgs).send(options);
                } catch(e) { err = e }

            } else {
                err = Error(`proxyHandler: Unsupported method "${method}"`);
            }

            const totalGasUsed = obj.totalGasUsed || 0;
            obj.gasUsed = result ? result.gasUsed || 0 : 0;
            obj.totalGasUsed = bn(totalGasUsed).add(bn(obj.gasUsed)).toString();

            this.updateStat(obj.gasUsed, txMeta.options.gasPrice)

        } catch(e) {
            err = e;
            releaseTxLock();
            releaseNonceLock();
            log.error(`submitTx failed: ${JSON.stringify(txMeta)}\n${e}`)
        }

        if(!err) {
            log.debug(`submitTx: CONFIRMED - ${txMeta.id} `);
            txMeta.status = 'confirmed';
        }
        else {
            log.error(`submitTx: FAILED - ${txMeta.id}, ${err}`);
            txMeta.status = 'failed';
        }
        txMeta.gasUsed = obj.gasUsed;
        txMeta.totalGasUsed = obj.totalGasUsed;

        this.updateTx(txMeta);
        const message = JSON.stringify(this.getTxStat('submitTxOUT'));
        if(err) {
            log.warn(message);
        } else {
            log.debug(message);
        }

        releaseTxLock();
        return [err, result]
    },

    getTxStat: function getTxStat (id) {
        let data = {};
        if(id) data.id = id;

        return extend(
            data, {
                submitted: this.getSubmittedTransactions().length,
                pending: this.getPendingTransactions().length,
                failed: this.getFailedTransactions().length,
                confirmed: this.getConfirmedTransactions().length,
                totalGasUsed: this.totalGasUsed.toString(),
                totalEthSpent: this.totalEthSpent.toString()
            })
    },

    updateStat: function updateStat(gasUsed, gasPrice) {
        const weiSpent =  bn(gasUsed).multiply(bn(gasPrice)).toString();
        this.totalGasUsed = this.totalGasUsed.add(bn(gasUsed));
        this.totalEthSpent = this.totalEthSpent + parseFloat(fromWei(weiSpent, 'ether'));

    },

    _getHighestLocallyConfirmed: function (address) {
        const confirmedTransactions = this.getConfirmedTransactions(address);
        const highest = this._getHighestNonce(confirmedTransactions);
        log.debug(`_getHighestLocallyConfirmed: ${address} -> ${highest}`);
        return Number.isInteger(highest) ? highest + 1 : 0
    },

    _getHighestContinuousFrom: function (txList, startPoint) {
        const nonces = txList.map(txMeta => txMeta.nonce);

        let highest = startPoint;
        while (nonces.includes(highest)) {
            highest++
        }
        log.debug(`_getHighestContinuousFrom:  ${startPoint} -> ${highest}`);

        return highest
    },

    _getHighestNonce: function (txList) {
        const nonces = txList.map(txMeta => txMeta.nonce);
        return Math.max.apply(null, nonces)
    },

    _getLock: async function getLock (address) {
        const mutex = this._lookupMutex(address);
        return mutex.acquire()
    },

    _getGlobalLock: async function getGlobalLock () {
        log.debug(`_getGlobalLock`);
        const globalMutex = this._lookupMutex('global');
        const releaseLock = await globalMutex.acquire();
        return { releaseLock }
    },

    _lookupMutex: function lookupMutex (lockId) {
        let mutex = this._lockMap[lockId];
        if (!mutex) {
            mutex = new Mutex();
            this._lockMap[lockId] = mutex
        }
        return mutex;
    },

    _globalLockFree: async function globalMutexFree () {
        const globalMutex = this._lookupMutex('global');
        const releaseLock = await globalMutex.acquire();
        releaseLock()
    },

    _createRandomId: function createRandomId() {
        this._idCounter = this._idCounter % Number.MAX_SAFE_INTEGER;
        return this._idCounter++
    }
};


const proxyHandler = {
    get: function ptoxyGet (obj, prop) {
        if(!obj.proxyMethods.includes(prop)) return obj[prop];
        if(prop in obj) return obj[prop];

        let isEvent = obj._events.includes(prop);

        if(isEvent) {
            const event = prop.split(/^on/)[1];
            obj[prop] = function proxyAddEvent (callback) {
                if(!callback || typeof callback !== 'function')
                    throw new Error('A callback must be a function!');
                obj.events[event](callback)
            };
            return obj[prop];
        }

        obj[prop] = async function proxyAddProp () {
            let err, result;
            const args = [].slice.call(arguments);

            const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
            if(callback) args.pop();

            const meta = await transactions.getTxMeta(obj, prop, ...args);
            [err, result] = await transactions.submitTx(obj, meta);
            return returnValue(err, result, callback);
        };

        return obj[prop]
    }
};


class Web3 {
    constructor (nodeAddress, mnemonic) {
        if (!nodeAddress)
            throw "Error: the node address is not defined!";

        const supportedProtocols = ['ws', 'wss', 'http', 'https', 'ipc'];
        let protocol;
        if (nodeAddress.search(/\.ipc$/) !== -1) protocol = 'ipc';
        else protocol = nodeAddress.split(':')[0];

        if (!supportedProtocols.includes(protocol))
            throw `"${protocol}" protocol is not supported! ` +
            `Supported protocols:\n${JSON.stringify(supportedProtocols)}`;

        const providers = {
            https: Web3js.providers.HttpProvider,
            http: Web3js.providers.HttpProvider,
            ipc: Web3js.providers.IpcProvider,
            wss: Web3js.providers.WebsocketProvider,
            ws: Web3js.providers.WebsocketProvider
        };

        let web3;

        if (protocol === 'ipc') {
            web3 = new Web3js(new providers[protocol](nodeAddress, net));
        }
        else if (mnemonic) {
            web3 = new Web3js(new HDWalletProvider(mnemonic, nodeAddress, 0, 20));
        } else {
            web3 = new Web3js(new providers[protocol](nodeAddress))
        }

        this.web3 = web3;
        return this.web3;
    }
}


class ContractInterface  extends EventEmitter {
    constructor (nodeAddress, contractAddress, mnemonic, abi, web3Instance) {
        super();
        if (web3Instance) {
            this.w3 = web3Instance;
        } else {
            if (!nodeAddress)
                throw "The node address is not defined!";
            this.protocol = nodeAddress.split(':')[0];
            this.w3 = new Web3(nodeAddress, mnemonic);
        }

        this.contract = new this.w3.eth.Contract(abi);
        this.methods = this.contract.methods;
        this.events = this.contract.events;

        if(contractAddress) {
            this._address = toChecksum(contractAddress);
            this.at(this._address);
        }

        this._abi = abi;
        this._gasPrice = null;
        this.gasLimit = '6000000';
        this.accounts = this.w3.currentProvider.addresses;
        this.walletIndex = 0;

        const _callStates = ['pure', 'view'];
        this._sent = this._abi.filter(item => !_callStates.includes(item.stateMutability) && item.type === 'function').map(item => item.name);
        this._call = this._abi.filter(item => _callStates.includes(item.stateMutability) && item.type === 'function').map(item => item.name);
        this._events = this._abi.filter(item => item.type === 'event').map(item => 'on' + item.name);
        this.proxyMethods = this._sent.concat(this._call).concat(this._events);
    }

    get wallet() {
        if (!this.accounts)
            return;
        return toChecksum(this.accounts[this.walletIndex])
    }

    set wallet(index) {
        this.walletIndex = index;
    }

    set gasPrice(price) {
        if(!price || Number(parseFloat(price)) !== price)
            this._gasPrice = null;
        else
            this._gasPrice = toWei(price.toString(), 'gwei');
    }

    get gasPrice() {
        return this._gasPrice;
    }

    get address() {
        return this._address;
    }

    set address(address) {
        this.at(address)
    }

    get abi() {
        return this.contract.options.jsonInterface;
    }

    set abi(abi) {
        this.contract.options.jsonInterface = abi;
    }

    at(address) {
        this._address = address;
        this.contract.options.address = toChecksum(address);
        return this;
    }

    async init() {
        if (!this.accounts) this.accounts = await this.w3.eth.getAccounts();
    }

    async getGasPrice(multiplier) {
        multiplier = multiplier || 1.2;
        const gasPrice = await this.w3.eth.getGasPrice();
        return Math.floor(gasPrice * multiplier);
    }


    async deploy(args, callback) {
        args = args || {};
        const bytecode = args.bytecode || this.bytecode;
        const contractArguments = args.args || [];
        await this.init();
        const blockGasPrice = await this.getGasPrice(1);
        const gasPrice = this.gasPrice || await this.getGasPrice();
        if(parseInt(blockGasPrice) > gasPrice) {
            log.warn(`the gas price is too low: ` +
                `blockchain - ${fromWei(blockGasPrice, 'gwei')}, ` +
                `TxObject - ${fromWei(gasPrice, 'gwei')} (GWEI)`)
        }

        const params = {
            from: this.wallet,
            gas: this.gasLimit,
            gasPrice: gasPrice
        };
        if(args.nonce) params.nonce = args.nonce;

        const [err, result] = await _to(this.contract.deploy({data: bytecode, arguments: contractArguments})
            .send(params)
            .once('transactionHash', (hash) => log.debug(` Tx hash: ${hash}`))
            .once('confirmation', (num, rec) => {
                log.debug(` address ${rec.contractAddress}`);

                let weiSpent = bn(rec.gasUsed).multiply(bn(gasPrice)).toString();

                if(rec) transactions.updateStat(rec.gasUsed, gasPrice);

                log.debug(JSON.stringify({
                    deploy: {
                        gasUsed: rec.gasUsed,
                        gasPrice: gasPrice,
                        weiSpent: weiSpent,
                        totalEthSpent: transactions.totalEthSpent
                    }
                }));
            }));
        this.at(result.options.address);
        returnValue(err, result, callback);
    };
}


class ERC20Interface extends ContractInterface{
    constructor(nodeAddress, tokenAddress, mnemonic, web3Instance, _abi, _bytecode) {
        const abi = _abi || erc20;
        super(nodeAddress, tokenAddress, mnemonic, abi, web3Instance);
        this.bytecode = _bytecode;
        this.supportedEvents = abi.filter(item => item.type === 'event').map(item => item.name);
        return new Proxy(this, proxyHandler);
    }

    static web3 (web3Instance, contractAddress, abi) {
        return new ERC20Interface(null, contractAddress, null, web3Instance, abi)
    }

    async tokenInfo (callback) {
        let err, name, symbol, decimals, totalSupply, paused;

        [err, name] = await _to(this.name());
        [err, symbol] = await _to(this.symbol());
        [err, decimals] = await _to(this.decimals());
        [err, totalSupply] = await  _to(this.totalSupply());
        [err, paused] = await _to(this.paused());

        const result =  {
            address: this._address,
            name: name,
            symbol: symbol,
            decimals: decimals != null ? parseInt(decimals):0,
            totalSupply: totalSupply || '0',
            paused: paused || false
        };

        this.info = result;

        return returnValue(null, result, callback);
    }

    onEvent(eventName, callback) {
        this.isWebSocket();
        this.events[eventName](callback);
    }

    async balanceOfAtBlock (holderAddress, blockNumber, callback)  {
        const block = parseInt(blockNumber);
        const address = toChecksum(holderAddress);
        const [err, result] = await _to(this.contract.methods.balanceOf(address).call("0x" + block.toString(16)));
        return returnValue(err, result, callback)
    };

    async valueOfAtBlock (name, blockNumber, params, callback)  {
        const block = parseInt(blockNumber);
        let args = params;
        if (typeof params === 'string') args = [params];
        else if (params == null) args = [];

        const [err, result] = await _to(this.contract.methods[name](...args)
            .call("0x" + block.toString(16)));
        return returnValue(err, result, callback)
    };

    async totalSupplyAtBlock (blockNumber, callback) {
        const block = parseInt(blockNumber);
        const [err, result] = await _to(this.contract.methods.totalSupply().call("0x" + block.toString(16)));
        return returnValue(err, result, callback)
    };

    isWebSocket(callback) {
        if (!['ws', 'wss'].includes(this.protocol))
            return callback(`Invalid protocol type - '${this.protocol}'! ` +
                `Only the 'ws://' and 'wss://' protocols support listening for events.\n`);
    }

    async getBlock (blockNumber, callback) {
        let [err, events] = await _to(this.contract.getPastEvents('allEvents', {fromBlock: blockNumber, toBlock: blockNumber}));
        if(!err) {
            events = events.filter(item => this.supportedEvents.includes(item.event));
            return returnValue(err, events, callback)
        }
        return returnValue(err, null, callback);
    }

    async latest(callback) {
        const [err, latestBlock] =  await _to(this.w3.eth.getBlock('latest'));
        if(err) return returnValue(err, null, callback);
        return returnValue(err, latestBlock.number, callback);
    }

}


class AccessInterface extends ContractInterface {
    constructor (nodeAddress, contractAddress,  mnemonic, web3Instance, _abi, _bytecode) {
        const abi = _abi || monitor;
        super(nodeAddress, contractAddress, mnemonic, abi, web3Instance);
        this.bytecode = _bytecode;

        return new Proxy(this, proxyHandler);
    }

    static web3 (web3Instance, contractAddress, abi) {
        return new AccessInterface(null, contractAddress, null, web3Instance, abi)
    }

    async subscribe(tokenAddresses, numberOfDays, accessAddress, weiAmount, callback) {
        await this.init();
        if(!tokenAddresses || !tokenAddresses instanceof Array || !tokenAddresses.length)
            throw "TypeError: nodeAddresses is either not an array or an empty array.";

        let cb;
        for (let i=0; i<arguments.length; i++) {
            const arg = arguments[i];
            if (typeof arg === 'function') {
                cb = arg;
                break
            }
        }

        const minDays = await this.minDays();

        const address = (accessAddress && typeof accessAddress !== 'function') ? toChecksum(accessAddress) : toChecksum(this.wallet);
        const days = (numberOfDays && typeof numberOfDays !== 'function') ? numberOfDays : parseInt(minDays);

        let [err, isSubscribed] = await _to(this.isExistingSubscriber());
        if (err) return returnValue(err, null, cb);

        if (!isSubscribed && days < minDays) throw `The number of days can't be less than ${minDays}`;

        let toPay, result;
        [err, toPay] = await _to(this.calculatePrice(days, tokenAddresses.length));
        if (err) return returnValue(err, null, cb);
        toPay = toPay['0'];
        let amount = (weiAmount && typeof weiAmount !== 'function') ? bn(weiAmount) : bn(toPay);

        if (amount.lt(bn(toPay))) {
            throw (`Not enough wei to pay. The minimum required amount is ${toPay}`);
        }
        amount = amount.toString();

        const tokens = tokenAddresses.map(toChecksum);
        const gasPrice = this.gasPrice || await this.getGasPrice();

        [err, result] = await _to(this.contract.methods.subscribe(address, days, tokens)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: gasPrice,
                value: amount
            }));
        if(result) transactions.updateStat(result.gasUsed, gasPrice);
        return returnValue(err, result, cb);
    }

    async subscribeAll(numberOfDays, accessAddress, weiAmount, callback) {
        await this.init();
        const address = accessAddress || this.wallet;
        const minDays = await this.minDays();
        const days = numberOfDays || parseInt(minDays);

        let [err, isSubscribed] = await _to(this.isExistingSubscriber());
        if (err) return returnValue(err, null, callback);

        if (!isSubscribed && days < minDays) throw `The number of days can't be less than ${minDays}`;

        let toPay, result;
        [err, toPay] = await _to(this.calculatePrice(days, 0));
        if (err) return returnValue(err, null, callback);

        toPay = toPay['0'];
        let amount = bn(weiAmount || toPay);

        if (amount.lt(bn(toPay))) {
            throw (`Not enough wei to pay. The minimum required amount is ${toPay}`);
        }
        const gasPrice = this.gasPrice || await this.getGasPrice();

        [err, result] = await _to(this.contract.methods.subscribeAll(address, days)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: gasPrice,
                value: amount.toString()
            }));
        if(result) transactions.updateStat(result.gasUsed, gasPrice);
        return returnValue(err, result, callback);
    }

    async getTokensSubscribedTo(callback) {
        await this.init();
        let [err, allTokens] = await _to(this.getAllSupportedTokens());
        if (err) return returnValue(err, null, callback);

        let subscription = [];
        let isSubscribed;
        for (let token of allTokens) {
            [err, isSubscribed] = await _to(this.isSubscribedToToken(token));
            if (err) return returnValue(err, null, callback);
            if (isSubscribed) subscription.push(token)
        }
        return returnValue(null, subscription, callback);
    }

    async addTokenToSubscription(tokenAddress, numberOfDays, accessAddress, weiAmount, callback) {
        await this.init();
        let [err, tokensList] = await _to(this.getTokensSubscribedTo());
        if (err) return returnValue(err, null, callback);

        tokensList.push(tokenAddress);

        let res;
        [err, res] = await _to(this.subscribe(tokensList, numberOfDays, accessAddress, weiAmount));
        if(result) transactions.updateStat(res.gasUsed, gasPrice);
        return returnValue(err, res, callback);
    }
}

module.exports = {
    ContractInterface,
    AccessInterface,
    ERC20Interface,
    Web3
};
