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
const net = require('net');
const monitorChainAbi = require('./AccessInterface');
const erc20 = require('./ERC20');
const bn = require('big-integer');


const toChecksum = (address) => {
    return Web3js.utils.toChecksumAddress(address)
};


const toWei = (amount, unit) => {
    return Web3js.utils.toWei(amount.toString(), unit);
};


const _to = (promise) => {
    return promise.then(data => {
        return [null, data];
    })
        .catch(err => [err, null]);
};


const returnValue = (err, result, callback) => {
    if (typeof callback === 'function') {
        return callback(err, result)
    }
    if (err) throw err;
    return result
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



class ContractInterface {
    constructor(web3, contractAddress, abi) {
        this._address = toChecksum(contractAddress);
        this._abi = abi;
        this.contract = new web3.eth.Contract(this._abi, this._address);
        this.methods = this.contract.methods;
    }
}


class ContractFactory {
    constructor (nodeAddress, contractAddress, abi, mnemonic, web3Instance) {
        const address = toChecksum(contractAddress);

        if (web3Instance) {
            this.w3 = web3Instance;
            this.contract = new ContractInterface(this.w3, address, abi);

        } else {
            if (!nodeAddress || !contractAddress)
                throw "The node address and/or the MonitorChain contract's address is/are not defined!";
            this.protocol = nodeAddress.split(':')[0];

            this.w3 = new Web3(nodeAddress, mnemonic);
            this.contract = new ContractInterface(this.w3, address, abi);
        }

        this.walletIndex = 0;
        this.accounts = this.w3.currentProvider.addresses;
        this._gasPrice = toWei('3', 'gwei');
        this.gasLimit = '6000000';
        this._address = address;
    }

    get wallet() {
        if (!this.accounts)
            throw "The wallet has not been initialized yet. Call the 'init' method before accessing to the accounts.";
        return this.accounts[this.walletIndex]
    }

    set wallet(index) {
        this.walletIndex = index;
    }

    set gasPrice(price) {
        this._gasPrice = toWei(price.toString(), 'gwei');
    }

    get gasPrice() {
        return this._gasPrice;
    }

    async init() {
        if (!this.accounts) {
            this.accounts = await this.w3.eth.getAccounts();
        }
    }
}

class ERC20Interface extends ContractFactory{
    constructor(nodeAddress, tokenAddress, mnemonic, web3Instance, _abi) {
        const abi = _abi || erc20;
        super(nodeAddress, tokenAddress, abi, mnemonic, web3Instance);
        this.events = this.contract.contract.events;
        this.supportedEvents = abi.filter(item => item.type === 'event').map(item => item.name);
    }

    static web3 (web3Instance, contractAddress, abi) {
        return new ERC20Interface(null, contractAddress, null, web3Instance, abi)
    }

    async name(callback) {
        const [err, result] = await _to(this.contract.methods.name().call());
        return returnValue(err, result, callback);
    }

    async symbol(callback) {
        const [err, result] = await _to(this.contract.methods.symbol().call());
        return returnValue(err, result, callback);
    }

    async decimals(callback) {
        const [err, result] = await _to(this.contract.methods.decimals().call());
        return returnValue(err, result, callback);
    }

    async totalSupply(callback) {
        const [err, result] = await _to(this.contract.methods.totalSupply().call());
        return returnValue(err, result, callback);
    }

    async balanceOf(holder, callback) {
        const [err, result] = await _to(this.contract.methods.balanceOf(
            toChecksum(holder)
        ).call());
        return returnValue(err, result, callback);
    }

    async cap(callback) {
        const [err, result] = await _to(this.contract.methods.cap().call());
        return returnValue(err, result, callback);
    }

    async mintingFinished(callback) {
        const [err, result] = await _to(this.contract.methods.mintingFinished().call());
        return returnValue(err, result, callback);
    }

    async paused(callback) {
        const [err, result] = await _to(this.contract.methods.paused().call());
        return returnValue(err, result, callback);
    }

    async transfer(to, _value, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.transfer(toChecksum(to), _value)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice
            }));
        return returnValue(err, result, callback);
    };

    async transferFrom(from, to, value, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.transferFrom(
            toChecksum(from),
            toChecksum(to),
            value)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice
            }));
        return returnValue(err, result, callback);
    };

    async approve(_spender, value, callback) {
        await this.init();
        const spender = toChecksum(_spender);
        const [err, result] = await _to(this.contract.methods.approve(spender, value)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice
            }));
        return returnValue(err, result, callback);
    };

    async allowance(owner, spender, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.allowance(
            toChecksum(owner),
            toChecksum(spender))
            .call());
        return returnValue(err, result, callback);
    };

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
            totalSupply: totalSupply || 0,
            paused: paused
        };

        this.info = result;

        return returnValue(null, result, callback);
    }

    onEvent(eventName, callback) {
        this.isWebSocket();
        this.events[eventName](callback);
    }

    onTransfer(callback) {
        this.isWebSocket();
        this.events.Transfer(callback)
    }

    onApproval(callback) {
        this.isWebSocket();
        this.events.Approval(callback)
    }

    onOwnershipTransferred(callback) {
        this.isWebSocket();
        this.events.OwnershipTransferred(callback)
    }

    onMint(callback) {
        this.isWebSocket();
        this.events.Mint(callback)
    }

    onBurn(callback) {
        this.isWebSocket();
        this.events.Burn(callback)
    }

    onMintFinished(callback) {
        this.isWebSocket();
        this.events.MintFinished(callback)
    }

    onPause(callback) {
        this.isWebSocket();
        this.events.Pause(callback)
    }

    onUnpause(callback) {
        this.isWebSocket();
        this.events.Unpause(callback)
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
        let [err, events] = await _to(this.contract.contract.getPastEvents('allEvents', {fromBlock: blockNumber, toBlock: blockNumber}));
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

    async methods(method, params, callback) {
        await this.init();
        let args = params;
        if (typeof params === 'string') args = [params];
        else if (params == null) args = [];

        const [err, result] = await _to(this.contract.methods[method](...args)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice
            }));

        return returnValue(err, result, callback);
    }
}


class AccessInterface extends ContractFactory {
    constructor (nodeAddress, contractAddress,  mnemonic, web3Instance, _abi) {
        const abi = _abi || monitorChainAbi;
        super(nodeAddress, contractAddress, abi, mnemonic, web3Instance);

        this.events = this.contract.contract.events;
    }

    async minDays(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.minDays()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async priceForAllPerDay(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.priceForAllPerDay()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async pricePerTokenPerDay(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.pricePerTokenPerDay()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getTokenForEventId(eventId, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.getTokenForEventId(eventId)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getTotalStatusCounts(token, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.getTotalStatusCounts(
            toChecksum(token))
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getStatusLevel(tokenAddress, callback) {
        await this.init();
        const token = toChecksum(tokenAddress);
        const [err, result] = await _to(this.contract.methods.getStatusLevel(token)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getCurrentStatusDetails(tokenAddress, callback) {
        await this.init();
        const token = toChecksum(tokenAddress);
        const [err, result] = await _to(this.contract.methods.getCurrentStatusDetails(token)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getStatusDetails(tokenAddress, statusNumber, callback) {
        await this.init();
        const token = toChecksum(tokenAddress);
        const [err, result] = await _to(this.contract.methods.getStatusDetails(token, statusNumber)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getLastStatusDetails(tokenAddress, callback) {
        await this.init();
        const token = toChecksum(tokenAddress);
        const [err, result] = await _to(this.contract.methods.getLastStatusDetails(token)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async subscriptionIsValid(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.subscriptionIsValid()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async isExistingSubscriber(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.isExistingSubscriber()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async isSubscribedToToken(tokenAddress, callback) {
        await this.init();
        const token = toChecksum(tokenAddress);
        const [err, result] = await _to(this.contract.methods.isSubscribedToToken(token)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async canAccessToken(tokenAddress, callback) {
        await this.init();
        const token = toChecksum(tokenAddress);
        const [err, result] = await _to(this.contract.methods.canAccessToken(token)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getNumberSupportedTokens(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.getNumberSupportedTokens()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async getAllSupportedTokens(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.getAllSupportedTokens()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async remainingSubscriptionDays(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.remainingSubscriptionDays()
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    async unsubscribe(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.unsubscribe()
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice
            }));
        return returnValue(err, result, callback);
    }

    async calculatePrice(numberOfDays, numberTokens, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.calculatePrice(numberOfDays, numberTokens)
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
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

        [err, result] = await _to(this.contract.methods.subscribe(address, days, tokens)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice,
                value: amount
            }));
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

        [err, result] = await _to(this.contract.methods.subscribeAll(address, days)
            .send({
                from: this.wallet,
                gas: this.gasLimit,
                gasPrice: this.gasPrice,
                value: amount.toString()
            }));
        return returnValue(err, result, callback);
    }

    async getSubscriptionData(callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.getSubscriptionData()
            .call({from: this.wallet}));
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
        return returnValue(err, res, callback);
    }

    async isAddressBlocked(token, addressToCheck, callback) {
        await this.init();
        const [err, result] = await _to(this.contract.methods.isAddressBlocked(
            toChecksum(token),
            toChecksum(addressToCheck))
            .call({from: this.wallet}));
        return returnValue(err, result, callback);
    }

    onStatusChanged(callback) {
        if (!['ws', 'wss'].includes(this.protocol))
            throw `Invalid protocol type - '${this.protocol}'! ` +
            `Only the 'ws://' and 'wss://' protocols support listening for events.\n`;
        this.events.TokenStatusChanged(callback);
    }

}

module.exports = {
    AccessInterface,
    ERC20Interface,
    Web3
};
