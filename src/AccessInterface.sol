/**
 * Interface for accessing the MonitorChain smart contract methods
 * Copyright (C) 2018,  Alexandr Mekh
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

pragma solidity ^0.4.21;

contract ERC20 {
    function name() public constant returns(string);
    function symbol() public constant returns(string);
    function decimals() public constant returns(uint);
    function totalSupply() public constant returns (uint);
    function cap() public constant returns (uint);
    function balanceOf(address who) public view returns(uint256);
    function transfer(address to, uint256 value) public returns(bool);
    function transferFrom(address from, address to, uint256 value) public returns(bool);
    function allowance(address owner, address spender) public view returns(uint256);
    function approve(address spender, uint256 value) public returns(bool);
}

contract AccessInterface {
    function minDays() public view returns(uint8 minDays);
    function pricePerTokenPerDay() public view returns(uint8 pricePerTokenPerDay);
    function priceForAllPerDay() public view returns(uint8 priceForAllPerDay);

    function getTokenForEventId(uint16 eventId) public view returns (address tokenAddress);
    function getTotalStatusCounts(address tokenAddress) view public returns (uint16 errorsCount);
    function getStatusLevel(address tokenAddress) view public returns (uint8 errorLevel);
    function getCurrentStatusDetails(address tokenAddress) view public returns (
        uint8 errorLevel,
        string errorMessage,
        address setter,
        uint timestamp);

    function getStatusDetails(address tokenAddress, uint16 statusNumber) view public returns (
        uint8 errorLevel,
        string errorMessage,
        address setter,
        uint timestamp,
        bool invalid);

    function getLastStatusDetails(address tokenAddress) view public returns (
        uint8 errorLevel,
        string errorMessage,
        address setter,
        uint timestamp,
        bool invalid);


    function subscriptionIsValid() public view returns(bool isValid);
    function isExistingSubscriber() public view returns (bool isSubscriber);
    function isSubscribedToToken(address token) public view returns (bool isSubscribed);
    function canAccessToken(address token) public view returns (bool canAccess);
    function getNumberSupportedTokens() public view returns (uint numberOfTokens);
    function getAllSupportedTokens() public view returns (address[] allTokens);

    function remainingSubscriptionDays() public view returns (uint remainingDays);
    function unsubscribe() public;

    function calculatePrice(uint numberOfDays, uint numberTokens) view public returns (
        uint priceToPay,
        uint averageDailyPrice,
        uint remainingOverheadBalance);

    function subscribe(address subscribee, uint numberOfDays, address[] tokenAddresses) public payable;
    function subscribeAll(address subscribee, uint numberOfDays) public payable;

    function getSubscriptionData() public view returns (
        uint start,
        uint numberOfDays,
        uint dailyPrice,
        uint overheadBalance,
        address accessAddress);

    event TokenStatusChanged(uint16 eventId);
}
