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

'use strict';
const fs = require('fs');
const solc = require('solc');
const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const ERC20 = require('../src/interface').ERC20Interface;
const web3 = new Web3(ganache.provider());

const tokenContract = './test/token.sol';

let token, accounts;

const toWei = (amount, unit) => {
    return Web3.utils.toWei(amount.toString(), unit);
};

const compile = async () => {
    const source = fs.readFileSync(tokenContract, 'utf8');
    const compiled = await solc.compile(source, 1).contracts[':Token'];
    const abi = JSON.parse(compiled.interface);
    const bytecode = '0x' + compiled.bytecode;
    return {abi: abi, bytecode: bytecode}
};

before(async () => {
    accounts = await web3.eth.getAccounts();
    const compiled = await compile();

    token = ERC20.web3(web3, null, compiled.abi);
    await token.deploy({bytecode: compiled.bytecode});
});

describe ('ERC20', () => {
    it('deploys a contract', () => {
        assert.ok(token.address);
    });

    it('name', async () => {
        let result = await token.name();
        assert.strictEqual(result, 'ERC20 token');

    });

    it('symbol', async () => {
        let result = await token.symbol();
        assert.strictEqual(result, 'ERC20');

    });

    it('decimals', async () => {
        let result = await token.decimals();
        assert.strictEqual(result, '18');
    });

    it('cap', async () => {
        let result = await token.cap();
        assert.strictEqual(result, toWei('10000000', 'ether'));
    });

    it('totalSupply', async () => {
        let result = await token.totalSupply();
        assert.strictEqual(result, toWei('10000000', 'ether'));
    });

    it('balanceOf owner', async () => {
        let result = await token.balanceOf(accounts[0]);
        assert.strictEqual(result, toWei('10000000', 'ether'));
    });

    it('balanceOf holder', async () => {
        let result = await token.balanceOf(accounts[1]);
        assert.strictEqual(result, '0');
    });

    it('transfer', async () => {
        await token.transfer(accounts[1], toWei('1000', 'ether'));
        const ownerBalance = await token.balanceOf(accounts[0]);
        const holderBalance = await token.balanceOf(accounts[1]);
        assert.strictEqual(ownerBalance, toWei('9999000', 'ether'));
        assert.strictEqual(holderBalance, toWei('1000', 'ether'));

    });

    it('approve', async() => {
        assert.ok(await token.approve(accounts[1], toWei('555', 'ether')));
    });

    it('allowance', async () => {
        const allowance = await token.allowance(accounts[0], accounts[1]);
        assert.strictEqual(allowance, toWei(555, 'ether'))

    });

    it('transferFrom', async ()=> {
        token.wallet = 1;
        assert.ok(await token.transferFrom(accounts[0], accounts[2], toWei(333, 'ether')));
        const balanceFrom = await token.balanceOf(accounts[0]);
        const balanceTo = await token.balanceOf(accounts[2]);
        assert.strictEqual(balanceFrom, toWei(9998667, 'ether'));
        assert.strictEqual(balanceTo, toWei(333, 'ether'));
        assert.strictEqual(await token.allowance(accounts[0], accounts[1]), toWei(222, 'ether'));
    });
});
