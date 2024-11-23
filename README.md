import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Hash "mo:base/Hash";
import Error "mo:base/Error";
import Array "mo:base/Array";
import Iter "mo:base/Iter";
import Time "mo:base/Time";
import List "mo:base/List";
import Option "mo:base/Option";
import Nat "mo:base/Nat";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Buffer "mo:base/Buffer";

actor TokenMarketplace {
    // Types
    public type TokenId = Nat;
    public type Address = Principal;
    
    public type Token = {
        id: TokenId;
        name: Text;
        description: Text;
        owner: Address;
        createdAt: Time.Time;
        totalSupply: Nat;
        availableSupply: Nat;
        price: ?Nat; // Price per token if listed
    };

    public type ListingInfo = {
        tokenId: TokenId;
        price: Nat;
        quantity: Nat;
        seller: Address;
    };

    public type SavedAddress = {
        name: Text;
        address: Address;
    };

    public type UserBalance = {
        tokenId: TokenId;
        balance: Nat;
    };

    // State variables
    private stable var nextTokenId: TokenId = 0;
    private var tokens = HashMap.HashMap<TokenId, Token>(0, Nat.equal, Hash.hash);
    private var listings = HashMap.HashMap<TokenId, ListingInfo>(0, Nat.equal, Hash.hash);
    private var userBalances = HashMap.HashMap<Address, [UserBalance]>(0, Principal.equal, Principal.hash);
    private var savedAddresses = HashMap.HashMap<Address, [SavedAddress]>(0, Principal.equal, Principal.hash);

    // Helper functions
    private func _updateUserBalance(user: Address, tokenId: TokenId, amount: Nat) {
        let currentBalances = Option.get(userBalances.get(user), []);
        var found = false;
        
        let updatedBalances = Array.map<UserBalance, UserBalance>(
            currentBalances,
            func(balance: UserBalance) : UserBalance {
                if (balance.tokenId == tokenId) {
                    found := true;
                    return {
                        tokenId = tokenId;
                        balance = balance.balance + amount;
                    };
                };
                balance;
            }
        );

        let finalBalances = if (not found) {
            Array.append(updatedBalances, [{
                tokenId = tokenId;
                balance = amount;
            }]);
        } else {
            updatedBalances;
        };

        userBalances.put(user, finalBalances);
    };

    // Token Management
    public shared(msg) func createToken(
        name: Text, 
        description: Text, 
        initialSupply: Nat
    ) : async Result.Result<TokenId, Text> {
        let caller = msg.caller;
        
        let token : Token = {
            id = nextTokenId;
            name = name;
            description = description;
            owner = caller;
            createdAt = Time.now();
            totalSupply = initialSupply;
            availableSupply = initialSupply;
            price = null;
        };

        tokens.put(nextTokenId, token);
        _updateUserBalance(caller, nextTokenId, initialSupply);
        nextTokenId += 1;

        #ok(nextTokenId - 1)
    };

    public query func getToken(tokenId: TokenId) : async ?Token {
        tokens.get(tokenId)
    };

    public query func getBalance(user: Address, tokenId: TokenId) : async Nat {
        let balances = Option.get(userBalances.get(user), []);
        switch (Array.find<UserBalance>(balances, func(b) { b.tokenId == tokenId })) {
            case (?balance) { balance.balance };
            case (null) { 0 };
        }
    };

    // Marketplace functions
    public shared(msg) func listTokens(
        tokenId: TokenId, 
        price: Nat, 
        quantity: Nat
    ) : async Result.Result<(), Text> {
        let caller = msg.caller;
        
        // Check user's balance
        let userBalance = await getBalance(caller, tokenId);
        if (userBalance < quantity) {
            return #err("Insufficient tokens to list");
        };

        switch (tokens.get(tokenId)) {
            case (null) { #err("Token not found") };
            case (?token) {
                if (token.owner != caller) {
                    return #err("Not the token owner");
                };

                let listingInfo : ListingInfo = {
                    tokenId = tokenId;
                    price = price;
                    quantity = quantity;
                    seller = caller;
                };

                listings.put(tokenId, listingInfo);
                
                let updatedToken = {
                    id = token.id;
                    name = token.name;
                    description = token.description;
                    owner = token.owner;
                    createdAt = token.createdAt;
                    totalSupply = token.totalSupply;
                    availableSupply = token.availableSupply;
                    price = ?price;
                };
                tokens.put(tokenId, updatedToken);
                
                #ok()
            };
        }
    };

    public shared(msg) func buyTokens(
        tokenId: TokenId, 
        quantity: Nat
    ) : async Result.Result<(), Text> {
        let caller = msg.caller;
        
        switch (listings.get(tokenId)) {
            case (null) { #err("Token not listed for sale") };
            case (?listing) {
                if (caller == listing.seller) {
                    return #err("Cannot buy your own tokens");
                };

                if (quantity > listing.quantity) {
                    return #err("Not enough tokens available");
                };

                // Here you would typically handle the actual payment
                // For this example, we'll just transfer the tokens

                switch (tokens.get(tokenId)) {
                    case (null) { #err("Token not found") };
                    case (?token) {
                        // Update seller's balance
                        let sellerBalance = await getBalance(listing.seller, tokenId);
                        _updateUserBalance(listing.seller, tokenId, sellerBalance - quantity);

                        // Update buyer's balance
                        _updateUserBalance(caller, tokenId, quantity);

                        // Update listing
                        if (listing.quantity == quantity) {
                            listings.delete(tokenId);
                        } else {
                            let updatedListing : ListingInfo = {
                                tokenId = listing.tokenId;
                                price = listing.price;
                                quantity = listing.quantity - quantity;
                                seller = listing.seller;
                            };
                            listings.put(tokenId, updatedListing);
                        };
                        
                        #ok()
                    };
                }
            };
        }
    };

    // Transfer functions
    public shared(msg) func transferTokens(
        tokenId: TokenId, 
        to: Address, 
        amount: Nat
    ) : async Result.Result<(), Text> {
        let caller = msg.caller;
        
        let senderBalance = await getBalance(caller, tokenId);
        if (senderBalance < amount) {
            return #err("Insufficient balance");
        };

        // Update sender's balance
        _updateUserBalance(caller, tokenId, senderBalance - amount);
        
        // Update recipient's balance
        let recipientBalance = await getBalance(to, tokenId);
        _updateUserBalance(to, tokenId, recipientBalance + amount);
        
        #ok()
    };

    // Query functions
    public query func getListedTokens() : async [Token] {
    let listedTokens = Buffer.Buffer<Token>(0);

    for ((tokenId, listing) in listings.entries()) {
        switch (tokens.get(tokenId)) {
            case (?token) {
                let tokenWithListing = {
                    id = token.id;
                    name = token.name;
                    description = token.description;
                    owner = token.owner;
                    createdAt = token.createdAt;
                    totalSupply = token.totalSupply;
                    availableSupply = listing.quantity;
                    price = ?listing.price;
                };
                listedTokens.add(tokenWithListing);
            };
            case (null) {}; // Ignore if the token is missing
        };
    };

    Buffer.toArray(listedTokens)
};


    public query func getUserBalances(user: Address) : async [UserBalance] {
        Option.get(userBalances.get(user), [])
    };

    // Address book functions remain the same as before
    public shared(msg) func saveAddress(name: Text, address: Address) : async Result.Result<(), Text> {
        let caller = msg.caller;
        let savedAddr : SavedAddress = {
            name = name;
            address = address;
        };

        let currentAddresses = Option.get(savedAddresses.get(caller), []);
        let updatedAddresses = Array.append(currentAddresses, [savedAddr]);
        savedAddresses.put(caller, updatedAddresses);
        
        #ok()
    };

    public query func getSavedAddresses(user: Address) : async [SavedAddress] {
        Option.get(savedAddresses.get(user), [])
    };
}
