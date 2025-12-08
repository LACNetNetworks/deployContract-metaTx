// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

//Important: remember to implement Oz Erc2771Context
contract Storage is ERC2771Context { 
    uint256 private storedNumber;
    address public owner;
    
    //Important: you need to use _msgSender() instead of msg.sender
    modifier onlyOwner() {
        require(_msgSender() == owner, "Only owner");
        _;
    }
    
    //Important: Constructor requires LNet trusted forwarder address.
    constructor(address trustedForwarder, address contractOwner) ERC2771Context(trustedForwarder) {
      //send the contract owner address as parameter
      owner = contractOwner; 
    }

    function store(uint256 _number) public {
        storedNumber = _number;
        emit NumberStored(_number, _msgSender());
    }
    event NumberStored(uint256 newNumber, address indexed storedBy);
    
    function retrieve() public view returns (uint256) {
        return storedNumber;
    }
    
    function increment() public onlyOwner {
        storedNumber += 1;
        emit NumberStored(storedNumber, _msgSender());
    }
    
    function reset() public onlyOwner {
        storedNumber = 0;
        emit NumberStored(0, _msgSender());
    }
    
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}