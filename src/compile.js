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

const solc = require('solc');
const fs = require('fs');


const source = fs.readFileSync('./src/AccessInterface.sol', 'utf8');
const output = solc.compile(source, 1).contracts;

for (let item in output) {
    const abi = JSON.parse(output[item]['interface']);
    const contractName = item.replace(':', '');
    fs.writeFileSync(`./src/${contractName}.json`, JSON.stringify(abi, null, 4));
}
