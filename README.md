![MonitorChain Interface Library](https://monitorchain.com/wp-content/uploads/2018/08/Logo-MonitorChain-BlueS.png)

## monitorchain-interface-library
NodeJS libraries for interfacing and integrating MonitorChain by subscribers.

## Install
```bash
$ npm install monitorchain-interface-library
```

## USAGE
Following modules are being exported by the library:

- AccessInterface - the interface is providing the public and restricted-to-subscribers methods
- Web3 - returns the web3 provider. The type of the provider is defined by the protocol type (web socket,  http, ipc). If a 12 words mnemonic is passed - return the truffle-hdwallet-provider's instance
- ERC20Interface - can be used for accessing the ERC20 tokens' standard methods (name, symbol, totalSupply, etc.)

It supports both promises and the async-await calls with or without the callbacks.

## Examples
```javascript
const {AccessInterface} = require('monitorchain-interface-library');
const log = console.log;

const mc = new AccessInterface(
    'http://main.infura.io/<API KEY>',
    '0xF8CE9D2....71337Bd6201a', //The MonitorChain address
    '12 words mnemonic is here'
);

// Get the list of supported tokens (resolve a promise)
mc.getAllSupportedTokens().then(console.log);

// Get number of the supported tokens (using a callback)
mc.getNumberSupportedTokens((err, result) => {console.log(err, result)})

// Calculate a subscription price (async-await syntax)
const calc = async () => {
    // 45-days subscription for 50 tokens
    const price = await mc.calculatePrice(45, 50);
    console.log(price);
};

calc();

// Subscribe to given list of tokens (default period)
const tokens = [
    "0xB8c77482e45F1F44dE1745F52C74426C631bDD52",
    "0xf230b790E05390FC8295F4d3F60332c93BEd42e2"
];

mc.subscribe(tokens, (err, result) => {
    console.log(`${err ? 'Fail':'Success'}`)
});

// 45 days subscription
let token = "0xE41d2489571d322189246DaFA5ebDe1F4699F498";
mc.subscribe([token], 45, (err, result) => {
 console.log(`${err ? 'Fail':'Success'}`)
});

// Add a token to subscription (30 days), remit 1 eth for further purposes
const weiPerEth = "1000000000000000000";
let newToken = "0xA4e8C3Ec456107eA67d3075bF9e3DF3A75823DB0";
mc.init().then(() => {
    mc.wallet = 1;  // use the second address from the 'addresses' array generated by the truffle hdwallet provider
    mc.addTokenToSubscription(newToken, null, null, weiPerEth, (err, result) => {
        console.log(`${err ? err:'Success'}`)
    })
});
```

#### Using a built-in truffle hdwallet provider
```javascript
const {AccessInterface} = require('monitorchain-interface-library');
const log = console.log;

const mc = new AccessInterface(
    'http://localhost:8545',
    '0xF8CE9D27Ff65E59cc5499a44f3fd71337Bd6201a',
    '12 words mnemonic is here'
);

const subscribe = async() => {
    mc.wallet = 2;

    log(await mc.getSubscriptionData());
    log(await mc.getTokensSubscribedTo());

    await mc.subscribe([
        "0xB8c77482e45F1F44dE1745F52C74426C631bDD52"
    ]);

    log(await mc.getSubscriptionData());
    log(await mc.remainingSubscriptionDays());
    log(await mc.getTokensSubscribedTo());
};

subscribe();
```


#### Using a custom web3 instance

```javascript
const {AccessInterface} = require('monitorchain-interface-library');
const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const nodeAddress =  'http://localhost:8545';
const monitorChainAddress = '0xF8CE9D27Ff65E59cc5499a44f3fd71337Bd6201a';
const mnemonic = '12 words mnemonic is here';

const web3 = new Web3(new HDWalletProvider(mnemonic, nodeAddress, 0, 20));

// A static method 'web3' allows to pass a custom web3 instance
const mc = AccessInterface.web3(web3, monitorChainAddress);

mc.getAllSupportedTokens(console.log);
```

## Listening for realtime events
```javascript
const {AccessInterface, ERC20Interface} = require('monitorchain-interface-library');
const log = console.log;
const monitorChainAddress = '0xF8CE9D27Ff65E59cc5499a44f3fd71337Bd6201a';


const mc = new AccessInterface(
    'http://localhost:8545',
    monitorChainAddress,
    '12 words mnemonic is here'
);

const ws = new AccessInterface(
    'ws://localhost:8543',
    monitorChainAddress
);

const callback = async (err, result) => {
    if(err) throw err;
    const tokenAddress = await mc.getTokenForEventId(result);
    if (!tokenAddress) return; // return if a customer is not subscribed to token

    log(`${tokenAddress}: a status has been changed: ${result}`);
    log(await mc.getCurrentStatusDetails(tokenAddress));
    const token =ERC20Interface.web3(mc.w3, tokenAddress);
    const tokenInfo = await token.tokenInfo();
    log(JSON.stringify(tokenInfo, null, 4));
};

ws.onStatusChanged(callback);
```
## Troubleshooting
##### Error: Transactions are too slow
Increase a gas price:
```javascript
const {ERC20Interface} = require('monitorchain-interface-library');
const token = new ERC20Interface(...);
...
token.gasPrice = 3; //gWei
...

```
##### Error: Exceeds block gas limit
Decrease the gasLimit:
```javascript
const {ERC20Interface} = require('monitorchain-interface-library');
const token = new ERC20Interface(...);
...
token.gasLimit = '3000000'
...

```

#### Error: Cannot find module 'ethereumjs-wallet/hdkey'
```bash
$ npm uninstall ethereumjs-wallet
$ npm install ethereumjs-wallet@0.6.0
```

## License

[GPL-2.0](https://opensource.org/licenses/GPL-2.0 "GNU General Public License version 2")
