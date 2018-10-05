import * as Web3js from 'web3';

type Callback<T> = (error: Error, result: T) => void;
type ABIDataTypes = "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "bool" | "string" | "bytes" | "address" | string;

declare interface ABIDefinition {
    constant?: boolean
    inputs?: Array<{ name: string, type: ABIDataTypes, indexed?: boolean }>
    name?: string
    outputs?: Array<{ name: string, type: ABIDataTypes }>
    payable?: boolean
    stateMutability?: "nonpayable" | "payable" | "pure" | "view"
    anonymous?: boolean
    type: "function" | "constructor" | "event" | "fallback"
}

declare interface EventLog {
    event: string
    address: string
    returnValues: any
    logIndex: number
    transactionIndex: number
    transactionHash: string
    blockHash: string
    blockNumber: number
    raw?: { data: string, topics: string[] }
}

declare interface TokenInfo {
    address: string,
    name: string,
    symbol: string,
    decimals: number,
    totalSupply: string | number,
    paused: boolean
}

export declare class Web3 {
    constructor(nodeAddress: URL, mnemonic: string)
}

declare class ContractInterface {
    wallet: string;
    gasPrice: string;
    init(): void;
}

export declare class ERC20Interface extends ContractInterface {
    constructor(nodeAddress: URL, contractAddress: string, mnemonic?: string, web3Instance?: new () => Web3js.default, abi?: ABIDefinition);
    static web3(web3Instance: new () => Web3js.default, contractAddress: string, abi: ABIDefinition): ERC20Interface;

    info: {
        address: string,
        name: string,
        symbol: string,
        decimals: number,
        totalSupply: string,
        paused: boolean
    };

    name(callback?: Callback<string>): string;
    symbol(callback?: Callback<string>): string;
    decimals(callback?: Callback<number>): number;
    totalSupply(callback?: Callback<string>): string;
    balanceOf(holder: string, callback?: Callback<string>): string;
    cap(callback?: Callback<string>): string;
    mintingFinished(callback?: Callback<boolean>): boolean
    paused(callback?: Callback<boolean>): boolean
    transfer(to: string, value: string | number, callback?: Callback<void>): void;
    transferFrom(from: string, to: string, value: string | number, callback?: Callback<void>): void;
    approve(spender: string, value: string | number, callback?: Callback<void>): void;
    allowance(owner: string, spender: string, value: string | number, callbck?: Callback<void>): void;
    tokenInfo(callback?: Callback<TokenInfo>): TokenInfo;
    onEvent(callback?: Callback<EventLog>): EventLog;
    onTransfer(callback?: Callback<EventLog>): EventLog;
    onApproval(callback?: Callback<EventLog>): EventLog;
    onOwnershipTransferred(callback?: Callback<EventLog>): EventLog;
    onMint(callback?: Callback<EventLog>): EventLog;
    onBurn(callback?: Callback<EventLog>): EventLog;
    onMintFinished(callback?: Callback<EventLog>): EventLog;
    onPause(callback?: Callback<EventLog>): EventLog;
    onUnpause(callback?: Callback<EventLog>): EventLog;
}


export declare class AccessInterface extends ContractInterface {
    constructor(nodeAddress: URL, contractAddress: string, mnemonic?: string, web3Instance?: new () => Web3js.default, abi?: ABIDefinition);
    static web3(web3Instance: new () => Web3js.default, contractAddress: string, abi: ABIDefinition): AccessInterface;

    minDays(callback?: Callback<number>): Promise<number>;
    priceForAllPerDay(callback?: Callback<number>): Promise<number>;
    pricePerTokenPerDay(callback?: Callback<number>): Promise<number>;
    getTokenForEventId(eventId: number, callback?: Callback<string>): string;
    getTotalStatusCounts(token: string, callback?: Callback<number>): number;
    getStatusLevel(token: string, callback: Callback<number>): Promise<number>;
    getCurrentStatusDetails(token: string, callback?: Callback<object>): object;
    getStatusDetails(token: string, statusNumber: number, callback?: Callback<object>): object;
    getLastStatusDetails(token: string, callback?: Callback<number>): Promise<number>;
    subscriptionIsValid(callback?: Callback<boolean>): boolean;
    isExistingSubscriber(callback?: Callback<boolean>): boolean;
    isSubscribedToToken(token: string, callback?: Callback<boolean>): boolean;
    canAccessToken(token: string, callback?: Callback<boolean>): boolean;
    getNumberSupportedTokens(callback?: Callback<number>): Promise<number>;
    getAllSupportedTokens(callback?: Callback<string[]>): string[];
    remainingSubscriptionDays(callback?: Callback<number>): Promise<number>;
    unsubscribe(callback?: Callback<void>): void;
    calculatePrice(numberOfDays: number, numberTokens: number, callback?: Callback<number>): Promise<number>;
    subscribe(
        tokenAddresses: string[],
        numberOfDays?: number,
        accessAddress?: string,
        weiAmount?: string,
        callback?: Callback<void>
    ): void;
    subscribeAll(
        numberOfDays?: number,
        accessAddress?: string,
        weiAmount?: string,
        callback?: Callback<void>
    ): void;
    getSubscriptionData(callback?: Callback<object>): object;
    getTokensSubscribedTo(callback?: Callback<string[]>): string[];
    addTokenToSubscription(
        tokenAddress: string,
        numberOfDays?: number,
        accessAddress?: string,
        weiAmount?: string,
        callback?: Callback<void>
    ): void;

    isAddressBlocked(token: string, address: string, callback?: Callback<boolean>): boolean;
    onStatusChanged(callback?: Callback<any>): EventLog;
}
