// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AuthentiChain {

    struct Product {
        uint256 id;
        address currentOwner;
        bool isSold;
        bytes32 metadataHash;
        uint256 registeredAt;
    }

    struct Transfer {
        address from;
        address to;
        uint256 timestamp;
    }

    uint256 private _productCounter;

    mapping(uint256 => Product) public products;
    mapping(uint256 => Transfer[]) public transferHistory;
    mapping(bytes32 => bool) public metadataHashExists;

    event ProductRegistered(
        uint256 indexed productId,
        address indexed manufacturer,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event OwnershipTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    event ProductSold(
        uint256 indexed productId,
        address indexed retailer,
        uint256 timestamp
    );

    modifier onlyCurrentOwner(uint256 productId) {
        require(products[productId].currentOwner == msg.sender, "Not current owner");
        _;
    }

    modifier productExists(uint256 productId) {
        require(products[productId].registeredAt != 0, "Product does not exist");
        _;
    }

    modifier notSold(uint256 productId) {
        require(!products[productId].isSold, "Product already sold");
        _;
    }

    function registerProduct(bytes32 metadataHash) external returns (uint256) {
        require(!metadataHashExists[metadataHash], "Product already registered");

        _productCounter++;
        uint256 productId = _productCounter;

        products[productId] = Product({
            id: productId,
            currentOwner: msg.sender,
            isSold: false,
            metadataHash: metadataHash,
            registeredAt: block.timestamp
        });

        metadataHashExists[metadataHash] = true;

        transferHistory[productId].push(Transfer({
            from: address(0),
            to: msg.sender,
            timestamp: block.timestamp
        }));

        emit ProductRegistered(productId, msg.sender, metadataHash, block.timestamp);

        return productId;
    }

    function transferProduct(uint256 productId, address to)
        external
        productExists(productId)
        onlyCurrentOwner(productId)
        notSold(productId)
    {
        require(to != address(0), "Cannot transfer to zero address");
        require(to != msg.sender, "Cannot transfer to self");

        address previousOwner = products[productId].currentOwner;
        products[productId].currentOwner = to;

        transferHistory[productId].push(Transfer({
            from: previousOwner,
            to: to,
            timestamp: block.timestamp
        }));

        emit OwnershipTransferred(productId, previousOwner, to, block.timestamp);
    }

    function markAsSold(uint256 productId)
        external
        productExists(productId)
        onlyCurrentOwner(productId)
        notSold(productId)
    {
        products[productId].isSold = true;
        emit ProductSold(productId, msg.sender, block.timestamp);
    }

    function getTransferHistory(uint256 productId)
        external
        view
        productExists(productId)
        returns (Transfer[] memory)
    {
        return transferHistory[productId];
    }

    function getProduct(uint256 productId)
        external
        view
        productExists(productId)
        returns (Product memory)
    {
        return products[productId];
    }

    function totalProducts() external view returns (uint256) {
        return _productCounter;
    }
}