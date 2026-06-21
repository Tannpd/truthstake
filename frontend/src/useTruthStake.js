import { useState, useCallback, useEffect } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';

let _readClient = null;

function getReadClient() {
  if (!_readClient) {
    _readClient = createClient({ chain: studionet });
  }
  return _readClient;
}

function getWriteClient(account) {
  return createClient({ chain: studionet, account });
}

// Convert Wei (u256) to human readable GEN string (up to 4 decimal places)
export function formatGen(weiVal) {
  if (!weiVal) return '0';
  try {
    const big = BigInt(weiVal);
    const integerPart = big / 10n**18n;
    const fractionalPart = big % 10n**18n;
    let fractionStr = fractionalPart.toString().padStart(18, '0');
    fractionStr = fractionStr.replace(/0+$/, ''); // Trim trailing zeros
    if (fractionStr === '') {
      return integerPart.toString();
    }
    return `${integerPart}.${fractionStr.slice(0, 4)}`;
  } catch (e) {
    return '0';
  }
}

// Convert human readable GEN input to Wei (u256 BigInt)
export function parseGen(genVal) {
  if (!genVal || genVal.toString().trim() === '') return 0n;
  try {
    const parts = genVal.toString().split('.');
    let integerPart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    fractionalPart = fractionalPart.slice(0, 18).padEnd(18, '0');
    return BigInt(integerPart) * 10n**18n + BigInt(fractionalPart);
  } catch (e) {
    return 0n;
  }
}

export function useTruthStake() {
  const [address, setAddress] = useState('');
  const [glAccount, setGlAccount] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txStatus, setTxStatus] = useState('');

  // Connect Wallet (MetaMask or fallback ephemeral account)
  const connectWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const addr = accounts[0].toLowerCase();
        setAddress(addr);
        setGlAccount(addr);
      } else {
        // Ephemeral account fallback
        let savedKey = localStorage.getItem('__truthstake_sk');
        let acct;
        if (savedKey) {
          acct = createAccount(savedKey);
        } else {
          acct = createAccount();
          localStorage.setItem('__truthstake_sk', acct.privateKey);
        }
        const addr = acct.address.toLowerCase();
        setAddress(addr);
        setGlAccount(acct);
      }
    } catch (err) {
      console.error('Wallet connection failed:', err);
      setError('Wallet connection failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all markets from smart contract
  const fetchMarkets = useCallback(async () => {
    if (!CONTRACT_ADDRESS) return;
    setLoading(true);
    try {
      const client = getReadClient();
      const countStr = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_market_count',
        args: [],
      });
      
      const count = parseInt(countStr || '0', 10);
      const list = [];
      
      for (let i = 0; i < count; i++) {
        // Get market basic information
        const rawDetails = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_market',
          args: [i],
        });
        const details = JSON.parse(rawDetails);
        
        // If wallet is connected, get user specific positions
        let userPos = { true_stake: '0', false_stake: '0', has_claimed: false };
        if (address) {
          const rawUserPos = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_user_stake',
            args: [i, address],
          });
          userPos = JSON.parse(rawUserPos);
        }
        
        list.push({
          ...details,
          userTrueStake: userPos.true_stake,
          userFalseStake: userPos.false_stake,
          userHasClaimed: userPos.has_claimed,
        });
      }
      
      setMarkets(list.reverse()); // Show newest first
      setError('');
    } catch (err) {
      console.error('Error fetching markets:', err);
      setError('Fetch markets failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Create new market
  const createMarket = async (statement, expectedVerdict, urlsArray, durationSeconds, stakeAmountGen) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected or contract address is missing');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Creating news prediction market...');

    try {
      const client = getWriteClient(glAccount);
      const valueWei = parseGen(stakeAmountGen);
      
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_market',
        args: [
          statement.trim(),
          expectedVerdict,
          JSON.stringify(urlsArray),
          parseInt(durationSeconds, 10)
        ],
        value: valueWei,
      });
      
      setTxHash(hash);
      setTxStatus('Transaction broadcasted. Awaiting block inclusion...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus(`Success! Market created.`);
      await fetchMarkets();
      return receipt;
    } catch (err) {
      console.error('Market creation failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Place bet on existing market
  const placeBet = async (marketId, verdict, stakeAmountGen) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus(`Placing stake on '${verdict}'...`);

    try {
      const client = getWriteClient(glAccount);
      const valueWei = parseGen(stakeAmountGen);
      
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'place_bet',
        args: [parseInt(marketId, 10), verdict],
        value: valueWei,
      });
      
      setTxHash(hash);
      setTxStatus('Stake submitted. Awaiting block finalization...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Contract execution error';
        throw new Error(errorMsg);
      }

      setTxStatus(`Bet successfully placed!`);
      await fetchMarkets();
      return receipt;
    } catch (err) {
      console.error('Betting failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Resolve market (Trigger AI facts checking and consensus)
  const resolveMarket = async (marketId) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Summoning GenLayer AI Validators to cross-check sources...');

    try {
      const client = getWriteClient(glAccount);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'resolve_market',
        args: [parseInt(marketId, 10)],
      });
      
      setTxHash(hash);
      setTxStatus('AI nodes are rendering references and verifying facts. This might take 15-30s...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Resolution error';
        throw new Error(errorMsg);
      }

      setTxStatus(`Market resolved successfully! Consensus achieved.`);
      await fetchMarkets();
      return receipt;
    } catch (err) {
      console.error('Resolution failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Claim winnings or refund
  const claimWinnings = async (marketId) => {
    if (!glAccount || !CONTRACT_ADDRESS) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError('');
    setTxHash('');
    setTxStatus('Withdrawing winnings/refund...');

    try {
      const client = getWriteClient(glAccount);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'claim_winnings',
        args: [parseInt(marketId, 10)],
      });
      
      setTxHash(hash);
      setTxStatus('Broadcasting claim. Awaiting block receipt...');

      const receipt = await client.waitForTransactionReceipt({ hash });
      
      const leaderReceipt = receipt.consensus_data?.leader_receipt?.[0];
      if (leaderReceipt && leaderReceipt.execution_result === 'ERROR') {
        const errorMsg = leaderReceipt.genvm_result?.stderr || 'Claim error';
        throw new Error(errorMsg);
      }

      setTxStatus('Winnings/stake successfully claimed!');
      await fetchMarkets();
      return receipt;
    } catch (err) {
      console.error('Claim failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('Failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (CONTRACT_ADDRESS) {
      fetchMarkets();
    }
  }, [CONTRACT_ADDRESS, address, fetchMarkets]);

  return {
    address,
    markets,
    loading,
    error,
    txHash,
    txStatus,
    connectWallet,
    fetchMarkets,
    createMarket,
    placeBet,
    resolveMarket,
    claimWinnings,
    contractAddress: CONTRACT_ADDRESS,
  };
}
