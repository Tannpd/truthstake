import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  Coins, 
  ShieldCheck, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  User, 
  Clock, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Info,
  HelpCircle,
  TrendingUp,
  Award
} from 'lucide-react';
import { useTruthStake, formatGen } from './useTruthStake';

export default function App() {
  const {
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
    contractAddress
  } = useTruthStake();

  // Tab Filtering: 'all', 'active', 'resolvable', 'resolved', 'my-bets'
  const [activeTab, setActiveTab] = useState('all');
  
  // Create Market Form State
  const [statement, setStatement] = useState('');
  const [expectedVerdict, setExpectedVerdict] = useState('TRUE');
  const [durationMinutes, setDurationMinutes] = useState('5');
  const [initialStake, setInitialStake] = useState('1');
  const [urls, setUrls] = useState([
    'https://www.reuters.com/article-sample',
    'https://apnews.com/article-sample',
    'https://www.bbc.com/news-sample'
  ]);
  const [formError, setFormError] = useState('');

  // Expandable Accordions for AI Reasoning
  const [expandedMarketIds, setExpandedMarketIds] = useState({});

  // Quick Bet Inputs: marketId -> betAmount
  const [betAmounts, setBetAmounts] = useState({});

  // Local System Time for calculating expired markets
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleExpand = (id) => {
    setExpandedMarketIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleBetAmountChange = (marketId, val) => {
    setBetAmounts(prev => ({
      ...prev,
      [marketId]: val
    }));
  };

  const addUrlField = () => {
    if (urls.length >= 5) return;
    setUrls([...urls, '']);
  };

  const removeUrlField = (index) => {
    if (urls.length <= 3) return;
    setUrls(urls.filter((_, i) => i !== index));
  };

  const handleUrlChange = (index, val) => {
    const nextUrls = [...urls];
    nextUrls[index] = val;
    setUrls(nextUrls);
  };

  // Form submission handler
  const handleCreateMarket = async (e) => {
    e.preventDefault();
    setFormError('');

    if (statement.trim() === '') {
      setFormError('News statement cannot be empty.');
      return;
    }

    if (urls.some(url => url.trim() === '')) {
      setFormError('Please fill out all reference URL fields.');
      return;
    }

    // Client-side domain whitelist pre-verification
    const whitelist = ["reuters.com", "apnews.com", "bloomberg.com", "nytimes.com", "bbc.com", "bbc.co.uk"];
    for (const url of urls) {
      const lower = url.toLowerCase().trim();
      const isValid = whitelist.some(d => lower.includes(`://${d}`) || lower.includes(`.${d}`));
      if (!isValid) {
        setFormError(`Domain not whitelisted: ${url}. Only Reuters, AP, Bloomberg, BBC, and NYTimes are allowed.`);
        return;
      }
    }

    const durationSeconds = parseInt(durationMinutes, 10) * 60;
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      setFormError('Please enter a valid positive duration.');
      return;
    }

    const stakeVal = parseFloat(initialStake);
    if (isNaN(stakeVal) || stakeVal <= 0) {
      setFormError('Please enter a valid initial stake.');
      return;
    }

    try {
      await createMarket(statement, expectedVerdict, urls, durationSeconds, initialStake);
      // Reset form
      setStatement('');
      setInitialStake('1');
      setUrls([
        'https://www.reuters.com/article-sample',
        'https://apnews.com/article-sample',
        'https://www.bbc.com/news-sample'
      ]);
    } catch (err) {
      // Error is set in custom hook
    }
  };

  // Filter logic
  const filteredMarkets = markets.filter(market => {
    const isExpired = now >= market.end_time;
    
    if (activeTab === 'active') {
      return !market.resolved && !isExpired;
    }
    if (activeTab === 'resolvable') {
      return !market.resolved && isExpired;
    }
    if (activeTab === 'resolved') {
      return market.resolved;
    }
    if (activeTab === 'my-bets') {
      const hasStakeTrue = market.userTrueStake && BigInt(market.userTrueStake) > 0n;
      const hasStakeFalse = market.userFalseStake && BigInt(market.userFalseStake) > 0n;
      return hasStakeTrue || hasStakeFalse;
    }
    return true; // 'all'
  });

  // Shorten addresses
  const truncateAddr = (addr) => {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  };

  // Calculation helpers
  const getPoolRatio = (trueStr, falseStr) => {
    const t = parseFloat(formatGen(trueStr)) || 0;
    const f = parseFloat(formatGen(falseStr)) || 0;
    const total = t + f;
    if (total === 0) return { truePct: 50, falsePct: 50 };
    return {
      truePct: Math.round((t / total) * 100),
      falsePct: Math.round((f / total) * 100),
      total
    };
  };

  const getRemainingTime = (endTime) => {
    const diff = endTime - now;
    if (diff <= 0) return 'Betting Closed';
    const min = Math.floor(diff / 60);
    const sec = diff % 60;
    if (min > 0) return `${min}m ${sec}s`;
    return `${sec}s remaining`;
  };

  return (
    <div className="app-container">
      {/* HEADER SECTION */}
      <header className="app-header glass-panel">
        <div className="brand">
          <div className="brand-logo">🦄</div>
          <div>
            <h1 className="brand-name">TruthStake</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Decentralized Fact-Checking Market</p>
          </div>
        </div>
        
        <div className="wallet-section">
          {address ? (
            <>
              <div className="network-badge">
                <span className="network-dot"></span>
                <span>GenLayer Studio</span>
              </div>
              <div className="network-badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'var(--border-color)' }}>
                <User size={14} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ color: 'var(--text-primary)' }}>{truncateAddr(address)}</span>
              </div>
            </>
          ) : (
            <button className="btn btn-wallet" onClick={connectWallet} disabled={loading}>
              <Coins size={16} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-rose)', padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <AlertTriangle style={{ color: 'var(--accent-rose)' }} />
          <div>
            <p style={{ fontWeight: '600', color: 'var(--text-primary)' }}>System Alert</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        </div>
      )}

      {/* DASHBOARD GRID */}
      <div className="dashboard-grid">
        
        {/* SIDEBAR COL */}
        <div className="sidebar-col">
          
          {/* STATS CARD */}
          <div className="glass-panel info-card">
            <h2 className="section-title">
              <TrendingUp size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span>Network Overview</span>
            </h2>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Markets</span>
                <span className="stat-value highlight">{markets.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Wallet Status</span>
                <span className="stat-value" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {address ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            {address && !window.ethereum && (
              <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--accent-yellow)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Info size={12} />
                <span>Using ephemeral local account fallback.</span>
              </div>
            )}
          </div>

          {/* CREATE MARKET CARD */}
          <div className="glass-panel info-card">
            <h2 className="section-title">
              <Plus size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span>Create Fact Market</span>
            </h2>
            
            <form onSubmit={handleCreateMarket}>
              <div className="form-group">
                <label className="form-label">News Claim / Statement</label>
                <textarea 
                  className="input-text input-textarea" 
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  placeholder="e.g. Reuters published that SpaceX Starship completed flight 5 successfully"
                  disabled={loading || !address}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Your Verdict (Initial Bet)</label>
                <select 
                  className="input-text input-select"
                  value={expectedVerdict}
                  onChange={(e) => setExpectedVerdict(e.target.value)}
                  disabled={loading || !address}
                >
                  <option value="TRUE">TRUE (Stake on agreement)</option>
                  <option value="FALSE">FALSE (Stake on disagreement)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Betting Duration (Minutes)</label>
                <input 
                  type="number"
                  className="input-text"
                  min="1"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  disabled={loading || !address}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Initial Stake Amount (GEN)</label>
                <input 
                  type="number"
                  step="0.01"
                  className="input-text"
                  min="0.01"
                  value={initialStake}
                  onChange={(e) => setInitialStake(e.target.value)}
                  disabled={loading || !address}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Reference URLs (3 - 5)</label>
                  {urls.length < 5 && (
                    <button 
                      type="button" 
                      onClick={addUrlField}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}
                      disabled={loading || !address}
                    >
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {urls.map((url, idx) => (
                    <div key={idx} className="url-input-container">
                      <input 
                        type="url"
                        className="input-text"
                        value={url}
                        onChange={(e) => handleUrlChange(idx, e.target.value)}
                        placeholder={`https://reuters.com/article...`}
                        disabled={loading || !address}
                      />
                      {urls.length > 3 && (
                        <button 
                          type="button" 
                          className="btn-icon-only" 
                          onClick={() => removeUrlField(idx)}
                          disabled={loading || !address}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="domain-whitelist" style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Allowed Domains:</span>
                  <div className="domain-whitelist">
                    <span className="domain-tag">reuters.com</span>
                    <span className="domain-tag">apnews.com</span>
                    <span className="domain-tag">bloomberg.com</span>
                    <span className="domain-tag">bbc.com</span>
                    <span className="domain-tag">nytimes.com</span>
                  </div>
                </div>
              </div>

              {formError && (
                <p style={{ color: 'var(--accent-rose)', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>
                  {formError}
                </p>
              )}

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading || !address}
                style={{ marginTop: '8px' }}
              >
                <Sparkles size={16} />
                <span>Deploy Fact Market</span>
              </button>
            </form>
          </div>

        </div>

        {/* CONTENT COL */}
        <div className="content-col">
          
          {/* TABS FILTER BAR */}
          <div className="glass-panel filter-bar">
            <div className="tabs">
              <button className={`tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Markets</button>
              <button className={`tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>Active Betting</button>
              <button className={`tab ${activeTab === 'resolvable' ? 'active' : ''}`} onClick={() => setActiveTab('resolvable')}>Resolvable</button>
              <button className={`tab ${activeTab === 'resolved' ? 'active' : ''}`} onClick={() => setActiveTab('resolved')}>Resolved</button>
              <button className={`tab ${activeTab === 'my-bets' ? 'active' : ''}`} onClick={() => setActiveTab('my-bets')}>My Bets</button>
            </div>
            
            <button className="btn btn-action" onClick={fetchMarkets} disabled={loading} style={{ width: 'auto' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin-slow' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* MARKETS GRID */}
          {filteredMarkets.length === 0 ? (
            <div className="glass-panel empty-state">
              <Compass />
              <p style={{ fontWeight: '600' }}>No markets found</p>
              <p style={{ fontSize: '13px' }}>Create a market on the left panel or check another filter category.</p>
            </div>
          ) : (
            <div className="markets-list grid-view">
              {filteredMarkets.map(market => {
                const isExpired = now >= market.end_time;
                const ratio = getPoolRatio(market.total_true, market.total_false);
                const hasStaked = BigInt(market.userTrueStake || '0') > 0n || BigInt(market.userFalseStake || '0') > 0n;
                const userWon = (market.verdict === 'TRUE' && BigInt(market.userTrueStake || '0') > 0n) || 
                                (market.verdict === 'FALSE' && BigInt(market.userFalseStake || '0') > 0n);
                
                return (
                  <div key={market.id} className={`glass-panel market-card status-${market.verdict.toLowerCase()}`}>
                    
                    {/* Header */}
                    <div className="market-header">
                      <span className="market-id">Market #{market.id}</span>
                      <span className={`status-badge ${market.verdict.toLowerCase()}`}>
                        {market.resolved ? market.verdict : (isExpired ? 'Resolvable' : 'Active')}
                      </span>
                    </div>

                    {/* News Claim */}
                    <h3 className="market-title">{market.statement}</h3>

                    {/* Progress Bar / Pools */}
                    <div className="pool-visualizer">
                      <div className="pool-label-row">
                        <span className="true-lbl">TRUE: {formatGen(market.total_true)} GEN ({ratio.truePct}%)</span>
                        <span className="false-lbl">{ratio.falsePct}% ({formatGen(market.total_false)} GEN) :FALSE</span>
                      </div>
                      <div className="pool-bar-bg">
                        <div className="pool-bar-fill true" style={{ width: `${ratio.truePct}%` }}></div>
                        <div className="pool-bar-fill false" style={{ width: `${ratio.falsePct}%` }}></div>
                      </div>
                    </div>

                    {/* Metadata: Ends in & Creator */}
                    <div className="market-metadata">
                      <div className="meta-item">
                        <span className="meta-label">Ending Time</span>
                        <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          {isExpired ? 'Ended' : getRemainingTime(market.end_time)}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Creator</span>
                        <span className="meta-value">{truncateAddr(market.creator)}</span>
                      </div>
                    </div>

                    {/* User Stake Status */}
                    {hasStaked && (
                      <div className="user-position-badge">
                        <span>Your Bet:</span>
                        <span>
                          {BigInt(market.userTrueStake) > 0n && `TRUE (${formatGen(market.userTrueStake)} GEN)`}
                          {BigInt(market.userFalseStake) > 0n && `FALSE (${formatGen(market.userFalseStake)} GEN)`}
                        </span>
                      </div>
                    )}

                    {/* Interactive Section */}
                    <div className="action-box" style={{ marginTop: '8px' }}>
                      
                      {/* Scenario 1: Market is Active & open for betting */}
                      {!market.resolved && !isExpired && (
                        <div className="action-box">
                          <input 
                            type="number"
                            step="0.1"
                            min="0.1"
                            className="input-text"
                            placeholder="Bet stake (GEN)"
                            value={betAmounts[market.id] || ''}
                            onChange={(e) => handleBetAmountChange(market.id, e.target.value)}
                            disabled={loading || !address}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn btn-true" 
                              disabled={loading || !address || !betAmounts[market.id]}
                              onClick={() => placeBet(market.id, 'TRUE', betAmounts[market.id])}
                            >
                              Bet TRUE
                            </button>
                            <button 
                              className="btn btn-false" 
                              disabled={loading || !address || !betAmounts[market.id]}
                              onClick={() => placeBet(market.id, 'FALSE', betAmounts[market.id])}
                            >
                              Bet FALSE
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Scenario 2: Betting closed, awaiting resolution */}
                      {!market.resolved && isExpired && (
                        <div>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>
                            Betting has ended. Summon the AI network to cross-check sources.
                          </p>
                          <button 
                            className="btn btn-primary"
                            onClick={() => resolveMarket(market.id)}
                            disabled={loading || !address}
                          >
                            <Sparkles size={14} />
                            <span>Resolve Market</span>
                          </button>
                        </div>
                      )}

                      {/* Scenario 3: Resolved. Display Payout Claims / Refunds */}
                      {market.resolved && hasStaked && (
                        <div>
                          {market.userHasClaimed ? (
                            <button className="btn btn-action" disabled={true} style={{ borderStyle: 'dashed' }}>
                              <CheckCircle size={14} style={{ color: 'var(--accent-emerald)' }} />
                              <span>Stakes Withdrawn</span>
                            </button>
                          ) : (
                            <>
                              {(userWon || market.verdict === 'ERROR' || ratio.total === 0) ? (
                                <button 
                                  className="btn btn-primary badge-claimable"
                                  onClick={() => claimWinnings(market.id)}
                                  disabled={loading || !address}
                                >
                                  <Award size={14} />
                                  <span>
                                    {market.verdict === 'ERROR' ? 'Claim Refund' : 'Claim Payout'}
                                  </span>
                                </button>
                              ) : (
                                <button className="btn btn-action" disabled={true}>
                                  <XCircle size={14} style={{ color: 'var(--accent-rose)' }} />
                                  <span>Lost Bet</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                    </div>

                    {/* AI Verdict & Accordion */}
                    {market.resolved && (
                      <div className="ai-section">
                        <button 
                          onClick={() => toggleExpand(market.id)}
                          style={{ background: 'transparent', border: 'none', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', outline: 'none' }}
                        >
                          <span className="ai-header">
                            <Sparkles size={14} />
                            <span>AI Oracle Verdict Insight</span>
                          </span>
                          {expandedMarketIds[market.id] ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                        </button>
                        
                        {expandedMarketIds[market.id] && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                            <p className="ai-reasoning">"{market.reason}"</p>
                            <div className="source-links">
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Sources Aggregated:</span>
                              {market.urls.map((url, idx) => (
                                <a key={idx} href={url} target="_blank" rel="noreferrer" className="source-item">
                                  <ExternalLink size={10} />
                                  <span>{url.replace(/https?:\/\/(www\.)?/, '').slice(0, 32)}...</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

      {/* TX STATUS BAR / FLOATING NOTIFICATION */}
      {txHash && (
        <div className="glass-panel tx-status-card" style={{ position: 'fixed', bottom: '24px', right: '24px', maxWidth: '380px', zIndex: 1000, borderLeft: '4px solid var(--accent-cyan)' }}>
          <div className="tx-status-title">
            <RefreshCw size={14} className="animate-spin-slow" />
            <span>GenLayer Tx Status</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{txStatus}</p>
          <a 
            href={`https://studio.genlayer.com/tx/${txHash}`} 
            target="_blank" 
            rel="noreferrer" 
            className="tx-hash-link"
          >
            Tx: {txHash}
          </a>
        </div>
      )}
    </div>
  );
}
