import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import Buffer "mo:base/Buffer";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Hash "mo:base/Hash";
import Debug "mo:base/Debug";
import Order "mo:base/Order";
import Text "mo:base/Text";

actor TokenMarketplace {
    // Token ve cüzdan için tip tanýmlamalarý
    public type TokenId = Nat;
    public type Token = {
        id: TokenId;
        name: Text;
        symbol: Text;
        owner: Principal;
        price: Nat;
        supply: Nat;
        createdAt: Time.Time;
    };

    public type WalletItem = {
        tokenId: TokenId;
        balance: Nat;
    };

    public type WalletItemResponse = {
        tokenId: TokenId;
        name: Text;
        balance: Nat;
    };

    // Satýþ iþlemleri için tip tanýmlamalarý
    public type SaleOrder = {
        tokenId: TokenId;
        seller: Principal;
        amount: Nat;
        price: Nat;
        createdAt: Time.Time;
    };

    public type TransactionType = {
    #Buy;
    #Sell;
    #MarketSell;
    #CreateSaleOrder;
    #PurchaseSaleOrder;
    #CancelSaleOrder;
};

public type Transaction = {
    id: Nat;
    tokenId: TokenId;
    tokenName: Text;
    amount: Nat;
    transactionType: TransactionType;
    user: Principal;
    timestamp: Time.Time;
};

    // Durumlarý saklayan deðiþkenler
    private stable var nextTokenId: TokenId = 0;
    private stable var tokenEntries: [(TokenId, Token)] = [];
    private stable var walletEntries: [(Principal, [WalletItem])] = [];
    private stable var saleOrderEntries: [(Nat, SaleOrder)] = [];
    private stable var nextSaleOrderId: Nat = 0;
    private stable var isInitialized: Bool = false;
    private stable var transactionEntries: [(Nat, Transaction)] = [];
    private stable var nextTransactionId: Nat = 0;

    // HashMap veri yapýlarý
    private var tokens = HashMap.HashMap<TokenId, Token>(0, Nat.equal, Hash.hash);
    private var wallets = HashMap.HashMap<Principal, [WalletItem]>(0, Principal.equal, Principal.hash);
    private var saleOrders = HashMap.HashMap<Nat, SaleOrder>(0, Nat.equal, Hash.hash);
    private var transactions = HashMap.HashMap<Nat, Transaction>(0, Nat.equal, Hash.hash);


    // Sistem baþlangýç ve upgrade iþlemleri
    system func preupgrade() {
        tokenEntries := Iter.toArray(tokens.entries());
        walletEntries := Iter.toArray(wallets.entries());
        saleOrderEntries := Iter.toArray(saleOrders.entries());
        transactionEntries := Iter.toArray(transactions.entries());
    };

    system func postupgrade() {
        tokens := HashMap.fromIter<TokenId, Token>(
            tokenEntries.vals(),
            0,
            Nat.equal,
            Hash.hash
        );
        wallets := HashMap.fromIter<Principal, [WalletItem]>(
            walletEntries.vals(),
            0,
            Principal.equal,
            Principal.hash
        );
        saleOrders := HashMap.fromIter<Nat, SaleOrder>(
            saleOrderEntries.vals(),
            0,
            Nat.equal,
            Hash.hash
        );
        transactions := HashMap.fromIter<Nat, Transaction>(
    transactionEntries.vals(),
    0,
    Nat.equal,
    Hash.hash
);
    };

    // Yeni eklenen doðrudan market satýþ fonksiyonu
    public shared(msg) func sellToMarket(tokenId: TokenId, amount: Nat) : async Result.Result<(), Text> {
        let balance = _getBalance(msg.caller, tokenId);
        
        if (balance < amount) {
            Debug.print("Insufficient balance for market sell");
            return #err("Yetersiz token bakiyesi");
        };

        switch(tokens.get(tokenId)) {
            case null {
                Debug.print("Token not found");
                #err("Token bulunamadý")
            };
            case (?token) {
                // Kullanýcýnýn cüzdanýndan tokenlarý çýkar
                _removeFromWallet(msg.caller, tokenId, amount);

                // Market supply'ý güncelle
                let updatedToken : Token = {
                    id = token.id;
                    name = token.name;
                    symbol = token.symbol;
                    owner = token.owner;
                    price = token.price;
                    supply = token.supply + amount;
                    createdAt = token.createdAt;
                };
                tokens.put(tokenId, updatedToken);
                _addTransaction(tokenId, amount, #MarketSell, msg.caller);

                Debug.print("Market sell successful: " # Nat.toText(amount) # " tokens");
                #ok()
            };
        }
    };

    // Token Yönetimi Fonksiyonlarý
    public shared(msg) func createToken(name: Text, symbol: Text, supply: Nat, price: Nat) : async Result.Result<TokenId, Text> {
        Debug.print("Creating new token: " # name);
        
        let token : Token = {
            id = nextTokenId;
            name = name;
            symbol = symbol;
            owner = msg.caller;
            price = price;
            supply = supply;
            createdAt = Time.now();
        };

        tokens.put(nextTokenId, token);
        Debug.print("Token added to HashMap with ID: " # Nat.toText(nextTokenId));
        
        nextTokenId += 1;
        #ok(nextTokenId - 1)
    };

    public shared(msg) func buyToken(tokenId: TokenId, amount: Nat) : async Result.Result<(), Text> {
        switch(tokens.get(tokenId)) {
            case null { 
                Debug.print("Token not found: " # Nat.toText(tokenId));
                #err("Token not found") 
            };
            case (?token) {
                if (token.supply < amount) {
                    Debug.print("Insufficient supply for token: " # Nat.toText(tokenId));
                    return #err("Not enough tokens available");
                };

                let updatedToken : Token = {
                    id = token.id;
                    name = token.name;
                    symbol = token.symbol;
                    owner = token.owner;
                    price = token.price;
                    supply = token.supply - amount;
                    createdAt = token.createdAt;
                };
                tokens.put(tokenId, updatedToken);

                _addToWallet(msg.caller, tokenId, amount);
                _addTransaction(tokenId, amount, #Buy, msg.caller);
                
                Debug.print("Token purchase successful: " # Nat.toText(amount) # " tokens of ID " # Nat.toText(tokenId));
                #ok()
            };
        }
    };

    // Token Satýþ Ýþlemleri
    public shared(msg) func createSaleOrder(tokenId: TokenId, amount: Nat, price: Nat) : async Result.Result<Nat, Text> {
        let balance = _getBalance(msg.caller, tokenId);
        
        if (balance < amount) {
            Debug.print("Insufficient balance for sale");
            return #err("Yetersiz token bakiyesi");
        };

        _removeFromWallet(msg.caller, tokenId, amount);

        let saleOrder : SaleOrder = {
            tokenId = tokenId;
            seller = msg.caller;
            amount = amount;
            price = price;
            createdAt = Time.now();
        };

        saleOrders.put(nextSaleOrderId, saleOrder);
        Debug.print("Sale order created with ID: " # Nat.toText(nextSaleOrderId));
        
        let orderId = nextSaleOrderId;
        nextSaleOrderId += 1;
        #ok(orderId)
    };

    public shared(msg) func purchaseSaleOrder(orderId: Nat) : async Result.Result<(), Text> {
        switch(saleOrders.get(orderId)) {
            case null {
                Debug.print("Sale order not found");
                #err("Satýþ emri bulunamadý")
            };
            case (?order) {
                if (order.seller == msg.caller) {
                    return #err("Kendi satýþ emrinizi satýn alamazsýnýz");
                };

                _addToWallet(msg.caller, order.tokenId, order.amount);
                saleOrders.delete(orderId);
                
                Debug.print("Sale order purchased successfully");
                #ok()
            };
        }
    };

    public shared(msg) func cancelSaleOrder(orderId: Nat) : async Result.Result<(), Text> {
        switch(saleOrders.get(orderId)) {
            case null {
                Debug.print("Sale order not found");
                #err("Satýþ emri bulunamadý")
            };
            case (?order) {
                if (order.seller != msg.caller) {
                    return #err("Sadece satýþ emri sahibi iptal edebilir");
                };

                _addToWallet(order.seller, order.tokenId, order.amount);
                saleOrders.delete(orderId);
                
                Debug.print("Sale order cancelled successfully");
                #ok()
            };
        }
    };

    // Sorgulama Fonksiyonlarý
    public query func getToken(tokenId: TokenId) : async ?Token {
        tokens.get(tokenId)
    };

    public query func listTokens() : async [Token] {
        let buffer = Buffer.Buffer<Token>(0);
        for ((_, token) in tokens.entries()) {
            buffer.add(token);
        };
        Debug.print("Listing " # Nat.toText(buffer.size()) # " tokens");
        Buffer.toArray(buffer)
    };

    public query func listSaleOrders() : async [SaleOrder] {
        let buffer = Buffer.Buffer<SaleOrder>(0);
        for ((_, order) in saleOrders.entries()) {
            buffer.add(order);
        };
        Buffer.toArray(buffer)
    };

    public query func getTransactionHistory() : async [Transaction] {
    let buffer = Buffer.Buffer<Transaction>(0);
    for ((_, transaction) in transactions.entries()) {
        buffer.add(transaction);
    };
    
    // Transactions'larý timestamp'e göre sýrala (en yeniden en eskiye)
    var transactionArray = Buffer.toArray(buffer);
    transactionArray := Array.sort(transactionArray, func (a: Transaction, b: Transaction) : Order.Order {
        if (a.timestamp > b.timestamp) { #less }
        else if (a.timestamp < b.timestamp) { #greater }
        else { #equal }
    });
    
    transactionArray
};

    

        public shared(msg) func getMyWallet() : async [WalletItemResponse] {
        let walletItems = Option.get(wallets.get(msg.caller), []);
        let buffer = Buffer.Buffer<WalletItemResponse>(0);
        
        for (item in walletItems.vals()) {
            // Sadece pozitif bakiyesi olan tokenlarý iþle
            if (item.balance > 0) {
                switch (tokens.get(item.tokenId)) {
                    case (?token) {
                        buffer.add({
                            tokenId = item.tokenId;
                            name = token.name;
                            balance = item.balance;
                        });
                    };
                    case null {
                        Debug.print("Warning: Token not found for ID: " # Nat.toText(item.tokenId));
                    };
                };
            };
        };

        var walletArray = Buffer.toArray(buffer);
        walletArray := Array.sort(walletArray, func (a: WalletItemResponse, b: WalletItemResponse) : Order.Order {
            let nameComparison = Text.compare(a.name, b.name);
            switch(nameComparison) {
                case (#equal) {
                    if (a.balance > b.balance) {
                        #less
                    } else if (a.balance < b.balance) {
                        #greater
                    } else {
                        if (a.tokenId < b.tokenId) {
                            #less
                        } else if (a.tokenId > b.tokenId) {
                            #greater
                        } else {
                            #equal
                        }
                    }
                };
                case (order) {
                    order
                };
            }
        });

        Debug.print("Wallet sorted by name, balance, and ID (excluding zero balances)");
        walletArray
    };


    public shared(msg) func getMyPrincipalId() : async Text {
        Debug.print("Caller Principal ID: " # Principal.toText(msg.caller));
        Principal.toText(msg.caller)
    };

    public query func getTokenCount() : async Nat {
        var count = 0;
        for ((_, _) in tokens.entries()) {
            count += 1;
        };
        count
    };

    // Yardýmcý Fonksiyonlar
    private func _addToWallet(user: Principal, tokenId: TokenId, amount: Nat) {
        let currentWallet = Option.get(wallets.get(user), []);
        var found = false;
        
        let updatedWallet = Array.map<WalletItem, WalletItem>(
            currentWallet,
            func(item: WalletItem) : WalletItem {
                if (item.tokenId == tokenId) {
                    found := true;
                    return {
                        tokenId = tokenId;
                        balance = item.balance + amount;
                    };
                };
                item
            }
        );

        let finalWallet = if (not found) {
            Array.append(updatedWallet, [{
                tokenId = tokenId;
                balance = amount;
            }]);
        } else {
            updatedWallet;
        };

        wallets.put(user, finalWallet);
    };


    private func _removeFromWallet(user: Principal, tokenId: TokenId, amount: Nat) {
        let currentWallet = Option.get(wallets.get(user), []);
        let updatedWallet = Array.map<WalletItem, WalletItem>(
            currentWallet,
            func(item: WalletItem) : WalletItem {
                if (item.tokenId == tokenId) {
                    return {
                        tokenId = tokenId;
                        balance = item.balance - amount;
                    };
                };
                item
            }
        );
        wallets.put(user, updatedWallet);
    };

    private func _getBalance(user: Principal, tokenId: TokenId) : Nat {
        let wallet = Option.get(wallets.get(user), []);
        switch (Array.find<WalletItem>(wallet, func(item) { item.tokenId == tokenId })) {
            case (?item) { item.balance };
            case null { 0 };
        }
    };

    private func _addTransaction(
    tokenId: TokenId,
    amount: Nat,
    transactionType: TransactionType,
    user: Principal
) {
    switch(tokens.get(tokenId)) {
        case (?token) {
            let transaction: Transaction = {
                id = nextTransactionId;
                tokenId = tokenId;
                tokenName = token.name;
                amount = amount;
                transactionType = transactionType;
                user = user;
                timestamp = Time.now();
            };
            
            transactions.put(nextTransactionId, transaction);
            nextTransactionId += 1;
        };
        case null {
            Debug.print("Token not found while adding transaction");
        };
    };
};
}