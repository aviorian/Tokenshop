import React, { useState, useEffect } from 'react';
import { backend } from 'declarations/backend';

const TokenShop = () => {
  // View state
  const [currentView, setCurrentView] = useState('browse');
  
  // Shop states
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    supply: '',
    price: ''
  });
  const [status, setStatus] = useState({
    loading: false,
    error: null,
    success: false,
    tokenId: null
  });
  const [tokens, setTokens] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState(null);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [buyAmount, setBuyAmount] = useState('');
  const [buyStatus, setBuyStatus] = useState({
    loading: false,
    error: null,
    success: false
  });

  // Wallet states
  const [walletItems, setWalletItems] = useState([]);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState(null);
  const [selectedWalletToken, setSelectedWalletToken] = useState(null);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellAmount, setSellAmount] = useState('');
  const [sellStatus, setSellStatus] = useState({
    loading: false,
    error: null,
    success: false
  });

  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState(null);

  const mockTransactions = [
    {
      timestamp: BigInt(Date.now()) * BigInt(1000000),
      type: { Buy: null },
      token: { name: "Test Token", symbol: "TST" },
      amount: BigInt(100),
      price: BigInt(50),
      status: "Completed"
    }
  ];

 useEffect(() => {
    fetchTokens();
    fetchWalletItems();
    if (currentView === 'transactions') {
      fetchTransactions();
    }
  }, [currentView]);

  // Shop functions
  const fetchTokens = async () => {
    try {
      const tokenList = await backend.listTokens();
      setTokens(tokenList);
      setBrowseError(null);
    } catch (err) {
      setBrowseError("Failed to load tokens");
      console.error("Error fetching tokens:", err);
    } finally {
      setBrowseLoading(false);
    }
  };

 const fetchTransactions = async () => {
    try {
      setTransactionsLoading(true);
      let history;
      
      try {
        history = await backend.getTransactionHistory();
        console.log("Raw transactions from backend:", history);
      } catch (err) {
        console.error("Backend error:", err);
        history = mockTransactions;
      }
      
      // Safely transform the transaction data with error handling
      const formattedHistory = history.map(tx => {
        try {
          // Preserve the original type structure from the backend
          return {
            timestamp: typeof tx.timestamp === 'bigint' ? tx.timestamp : 
                      typeof tx.timestamp === 'number' ? BigInt(tx.timestamp) : 
                      BigInt(Date.now()) * BigInt(1000000),
            // Keep the original type object structure
            type: tx.type || { Unknown: null },
            // Preserve the original token information
            token: tx.token || { name: "Unknown Token", symbol: "UNK" },
            amount: typeof tx.amount === 'bigint' ? tx.amount :
                   typeof tx.amount === 'number' ? BigInt(tx.amount) :
                   BigInt(0),
            price: typeof tx.price === 'bigint' ? tx.price :
                   typeof tx.price === 'number' ? BigInt(tx.price) :
                   BigInt(0),
            status: tx.status || "Completed"
          };
        } catch (err) {
          console.error("Error formatting transaction:", err);
          return {
            timestamp: BigInt(Date.now()) * BigInt(1000000),
            type: { Unknown: null },
            token: { name: "Error", symbol: "ERR" },
            amount: BigInt(0),
            price: BigInt(0),
            status: "Error"
          };
        }
      });

      console.log("Formatted transactions:", formattedHistory);
      setTransactions(formattedHistory);
      setTransactionsError(null);
    } catch (err) {
      console.error("Error in fetchTransactions:", err);
      setTransactionsError("Failed to load transaction history. Please try again later.");
    } finally {
      setTransactionsLoading(false);
    }
  };

   const formatTransactionType = (type) => {
    if (!type || typeof type !== 'object') return 'Unknown';
    
    // Get the type key (e.g., "Buy", "Sell", etc.)
    const typeKey = Object.keys(type)[0];
    
    const typeMapping = {
      Buy: 'Purchase',
      Sell: 'Sell',
      MarketSell: 'Market Sell',
      CreateSaleOrder: 'Created Sale Order',
      PurchaseSaleOrder: 'Purchased from Order',
      CancelSaleOrder: 'Cancelled Sale Order'
    };

    return typeMapping[typeKey] || typeKey || 'Unknown';
  };

  const formatDate = (timestamp) => {
    try {
      if (typeof timestamp === 'bigint') {
        // Convert nanoseconds to milliseconds
        return new Date(Number(timestamp / BigInt(1000000))).toLocaleDateString();
      }
      return new Date(timestamp).toLocaleDateString();
    } catch (err) {
      console.error("Error formatting date:", err);
      return 'Invalid Date';
    }
  };

   const formatSupply = (value) => {
    try {
      if (typeof value === 'bigint') {
        return new Intl.NumberFormat().format(Number(value));
      }
      if (typeof value === 'number') {
        return new Intl.NumberFormat().format(value);
      }
      return '0';
    } catch (err) {
      console.error("Error formatting supply:", err);
      return '0';
    }
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, error: null, success: false, tokenId: null });

    try {
      const result = await backend.createToken(
        formData.name,
        formData.symbol,
        BigInt(formData.supply),
        BigInt(formData.price)
      );

      if ('ok' in result) {
        setStatus({
          loading: false,
          error: null,
          success: true,
          tokenId: Number(result.ok)
        });
        setFormData({ name: '', symbol: '', supply: '', price: '' });
        fetchTokens();
      } else {
        throw new Error(result.err);
      }
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message || 'Failed to create token',
        success: false,
        tokenId: null
      });
    }
  };

  const handleBuySubmit = async (e) => {
    e.preventDefault();
    setBuyStatus({ loading: true, error: null, success: false });

    try {
      const result = await backend.buyToken(
        selectedToken.id,
        BigInt(buyAmount)
      );

      if ('ok' in result) {
        setBuyStatus({ loading: false, error: null, success: true });
        fetchTokens();
        fetchWalletItems();
        setTimeout(() => {
          setBuyModalOpen(false);
          setBuyStatus({ loading: false, error: null, success: false });
          setBuyAmount('');
        }, 2000);
      } else {
        throw new Error(result.err);
      }
    } catch (error) {
      setBuyStatus({
        loading: false,
        error: error.message || 'Failed to buy token',
        success: false
      });
    }
  };

  // Wallet functions
  const fetchWalletItems = async () => {
    try {
      setWalletLoading(true);
      const items = await backend.getMyWallet();
      setWalletItems(items);
      setWalletError(null);
    } catch (err) {
      setWalletError("Failed to load wallet items");
      console.error("Error fetching wallet:", err);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleSellToMarket = async (e) => {
    e.preventDefault();
    setSellStatus({ loading: true, error: null, success: false });

    try {
      const result = await backend.sellToMarket(
        selectedWalletToken.tokenId,
        BigInt(sellAmount)
      );

      if ('ok' in result) {
        setSellStatus({ loading: false, error: null, success: true });
        fetchWalletItems();
        fetchTokens();
        setTimeout(() => {
          setSellModalOpen(false);
          setSellStatus({ loading: false, error: null, success: false });
          setSellAmount('');
        }, 2000);
      } else {
        throw new Error(result.err);
      }
    } catch (error) {
      setSellStatus({
        loading: false,
        error: error.message || 'Failed to sell token',
        success: false
      });
    }
  };

  

  // Modal Components
  const BuyTokenModal = () => {
    if (!buyModalOpen || !selectedToken) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Buy {selectedToken.name}</h3>
            <button
              onClick={() => {
                setBuyModalOpen(false);
                setBuyStatus({ loading: false, error: null, success: false });
                setBuyAmount('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ?
            </button>
          </div>

          {!buyStatus.success ? (
            <form onSubmit={handleBuySubmit}>
              <div className="mb-4 space-y-2">
                <p className="text-sm text-gray-600">
                  Available supply: {formatSupply(selectedToken.supply)}
                </p>
                <p className="text-sm text-gray-600">
                  Price per token: {formatSupply(selectedToken.price)} ICP
                </p>
              </div>

              <input
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="Amount to buy"
                min="1"
                max={Number(selectedToken.supply)}
                className="mb-4 w-full rounded-md border-2 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />

              {buyStatus.error && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-red-600">
                  {buyStatus.error}
                </div>
              )}

              <button
                type="submit"
                disabled={buyStatus.loading}
                className="w-full rounded-md bg-blue-500 px-3 py-2 font-semibold text-white shadow-lg transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50 disabled:opacity-50"
              >
                {buyStatus.loading ? 'Processing...' : 'Confirm Purchase'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="mb-4 text-green-500">
                ? Purchase successful!
              </div>
              <button
                onClick={() => {
                  setBuyModalOpen(false);
                  setBuyStatus({ loading: false, error: null, success: false });
                  setBuyAmount('');
                }}
                className="rounded-md bg-blue-500 px-4 py-2 font-semibold text-white shadow-lg transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SellModal = () => {
    if (!sellModalOpen || !selectedWalletToken) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Sell {selectedWalletToken.name}</h3>
            <button
              onClick={() => {
                setSellModalOpen(false);
                setSellStatus({ loading: false, error: null, success: false });
                setSellAmount('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ?
            </button>
          </div>

          {!sellStatus.success ? (
            <form onSubmit={handleSellToMarket}>
              <div className="mb-4 space-y-2">
                <p className="text-sm text-gray-600">
                  Available balance: {selectedWalletToken.balance}
                </p>
              </div>

              <input
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="Amount to sell"
                min="1"
                max={selectedWalletToken.balance}
                className="mb-4 w-full rounded-md border-2 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />

              {sellStatus.error && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-red-600">
                  {sellStatus.error}
                </div>
              )}

              <button
                type="submit"
                disabled={sellStatus.loading}
                className="w-full rounded-md bg-blue-500 px-3 py-2 font-semibold text-white shadow-lg transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50 disabled:opacity-50"
              >
                {sellStatus.loading ? 'Processing...' : 'Confirm Sale'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="mb-4 text-green-500">
                ? Sale successful!
              </div>
              <button
                onClick={() => {
                  setSellModalOpen(false);
                  setSellStatus({ loading: false, error: null, success: false });
                  setSellAmount('');
                }}
                className="rounded-md bg-blue-500 px-4 py-2 font-semibold text-white shadow-lg transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <div className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
              <div className="flex space-x-4">
                <button
                  onClick={() => setCurrentView('browse')}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium ${
                    currentView === 'browse'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  } rounded-md`}
                >
                  Browse Tokens
                </button>
                <button
                  onClick={() => setCurrentView('create')}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium ${
                    currentView === 'create'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  } rounded-md`}
                >
                  Create Token
                </button>
                <button
                  onClick={() => setCurrentView('wallet')}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium ${
                    currentView === 'wallet'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  } rounded-md`}
                >
                  My Wallet
                </button>
                <button
                onClick={() => setCurrentView('transactions')}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium ${
                  currentView === 'transactions'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                } rounded-md`}
              >
                Transactions
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Browse View */}
        {currentView === 'browse' && (
          <div className="min-h-screen">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">Available Tokens</h1>
              <button
                onClick={fetchTokens}
                className="rounded-md bg-blue-500 px-4 py-2 font-semibold text-white"
              >
                Refresh
              </button>
            </div>
            
            {browseLoading ? (
              <div className="flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading tokens...</div>
              </div>
            ) : browseError ? (
              <div className="rounded-lg bg-red-50 p-4 text-red-600">
                <p>{browseError}</p>
                <button 
                  onClick={fetchTokens}
                    className="mt-2 text-sm text-red-700 underline"
                >
                  Try again
                </button>
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center text-gray-600">
                <p>No tokens available</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {tokens.map((token) => (
                  <div
                    key={token.id}
                    className="overflow-hidden rounded-lg bg-white p-6 shadow-lg transition duration-300 ease-in-out hover:shadow-xl"
                  >
                    <div className="mb-4">
                      <h3 className="text-xl font-semibold text-gray-900">{token.name}</h3>
                      <p className="text-sm text-gray-500">{token.symbol}</p>
                    </div>
                    <div className="mb-4 space-y-2">
                      <p className="text-sm text-gray-600">
                        Available: {formatSupply(token.supply)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Price: {formatSupply(token.price)} ICP
                      </p>
                      <p className="text-sm text-gray-600">
                        Created: {formatDate(token.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedToken(token);
                        setBuyModalOpen(true);
                      }}
                      className="w-full rounded-md bg-blue-500 px-4 py-2 font-semibold text-white shadow transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50"
                    >
                      Buy Token
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Token View */}
        {currentView === 'create' && (
          <div className="mx-auto max-w-2xl">
            <h1 className="mb-8 text-3xl font-bold text-gray-900">Create New Token</h1>
            <form onSubmit={handleCreateSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Token Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-2 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-300"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Symbol
                </label>
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) =>
                    setFormData({ ...formData, symbol: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-2 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-300"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Initial Supply
                </label>
                <input
                  type="number"
                  value={formData.supply}
                  onChange={(e) =>
                    setFormData({ ...formData, supply: e.target.value })
                  }
                  min="1"
                  className="mt-1 block w-full rounded-md border-2 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-300"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Price (ICP)
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  min="1"
                  className="mt-1 block w-full rounded-md border-2 bg-white px-3 py-2 text-gray-700 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-300"
                  required
                />
              </div>

              {status.error && (
                <div className="rounded-md bg-red-50 p-4 text-red-600">
                  {status.error}
                </div>
              )}

              {status.success && (
                <div className="rounded-md bg-green-50 p-4 text-green-600">
                  Token created successfully! Token ID: {status.tokenId}
                </div>
              )}

              <button
                type="submit"
                disabled={status.loading}
                className="w-full rounded-md bg-blue-500 px-4 py-2 font-semibold text-white shadow-lg transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50 disabled:opacity-50"
              >
                {status.loading ? 'Creating...' : 'Create Token'}
              </button>
            </form>
          </div>
        )}

        {/* Wallet View */}
        {currentView === 'wallet' && (
          <div className="min-h-screen">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">My Wallet</h1>
              <button
                onClick={fetchWalletItems}
                className="rounded-md bg-blue-500 px-4 py-2 font-semibold text-white"
              >
                Refresh
              </button>
            </div>

            {walletLoading ? (
              <div className="flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading wallet...</div>
              </div>
            ) : walletError ? (
              <div className="rounded-lg bg-red-50 p-4 text-red-600">
                <p>{walletError}</p>
                <button
                  onClick={fetchWalletItems}
                  className="mt-2 text-sm text-red-700 underline"
                >
                  Try again
                </button>
              </div>
            ) : walletItems.length === 0 ? (
              <div className="text-center text-gray-600">
                <p>No tokens in wallet</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {walletItems.map((item) => (
                  <div
                    key={item.tokenId}
                    className="overflow-hidden rounded-lg bg-white p-6 shadow-lg transition duration-300 ease-in-out hover:shadow-xl"
                  >
                    <div className="mb-4">
                      <h3 className="text-xl font-semibold text-gray-900">{item.name}</h3>
                      {item.symbol && <p className="text-sm text-gray-500">{item.symbol}</p>}
                    </div>
                    <div className="mb-4">
                      <p className="text-lg font-medium text-gray-900">
                        Balance: {new Intl.NumberFormat().format(Number(item.balance))}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedWalletToken(item);
                        setSellModalOpen(true);
                      }}
                      className="w-full rounded-md bg-blue-500 px-4 py-2 font-semibold text-white shadow transition duration-300 ease-in-out hover:bg-blue-600 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50"
                    >
                      Sell Token
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
        
        }

        {/* Transactions View */}
       {currentView === 'transactions' && (
        <div className="min-h-screen">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Transaction History</h1>
            <button
              onClick={fetchTransactions}
              className="rounded-md bg-blue-500 px-4 py-2 font-semibold text-white shadow hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50"
            >
              Refresh
            </button>
          </div>

          {transactionsLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-xl text-gray-600">Loading transactions...</div>
            </div>
          ) : transactionsError ? (
            <div className="rounded-lg bg-red-50 p-4 text-red-600">
              <p>{transactionsError}</p>
              <button
                onClick={fetchTransactions}
                className="mt-2 text-sm text-red-700 underline"
              >
                Try again
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-center text-gray-600">
                <p className="text-xl">No transactions found</p>
                <p className="mt-2">Your transaction history will appear here</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Token
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {transactions.map((transaction, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {formatDate(transaction.timestamp)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {formatTransactionType(transaction.type)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {transaction.token.name} ({transaction.token.symbol})
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {formatSupply(transaction.amount)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {formatSupply(transaction.price)} ICP
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                transaction.status === 'Completed'
                                  ? 'bg-green-100 text-green-800'
                                  : transaction.status === 'Pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {transaction.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Modals */}
      <BuyTokenModal />
      <SellModal />
    </div>
  );
};

export default TokenShop;