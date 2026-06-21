# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# =============================================================================
#  truthstake.py — Decentralized Fact-Checking Market
#  GenLayer Intelligent Contract (v0.2.16)
# =============================================================================

from genlayer import *
import json
from datetime import datetime, timezone

class Contract(gl.Contract):
    """
    TruthStake — Decentralized Fact-Checking & News Betting Market
    ==============================================================
    Allows users to wager on the truth of news claims. GenLayer's network
    of AI Validators fetches articles from whitelisted reputable domains,
    analyzes their content, and resolves the market with a consensus verdict.
    """

    # Monotonic market counter
    markets_count:           u64

    # Market Metadata
    market_statement:        TreeMap[u64, str]
    market_creator:          TreeMap[u64, Address]
    market_urls:             TreeMap[u64, str]      # JSON list of reputable URLs
    market_end_time:         TreeMap[u64, u64]      # UNIX timestamp when betting closes
    market_expected_verdict: TreeMap[u64, str]      # "TRUE" or "FALSE"
    
    # Market Status
    market_resolved:         TreeMap[u64, bool]
    market_verdict:          TreeMap[u64, str]      # "PENDING", "TRUE", "FALSE", "ERROR"
    market_reason:           TreeMap[u64, str]      # AI consensus explanation
    
    # Betting Pools (u256 for native GEN token amounts)
    market_total_true:       TreeMap[u64, u256]
    market_total_false:      TreeMap[u64, u256]
    
    # User stakes. Key format: "market_id:user_address_lowercase"
    user_stake_true:         TreeMap[str, u256]
    user_stake_false:        TreeMap[str, u256]
    user_has_claimed:        TreeMap[str, bool]

    # ═══════════════════════════════════════════════════════════════════
    # CONSTRUCTOR
    # ═══════════════════════════════════════════════════════════════════
    def __init__(self) -> None:
        """
        Constructor. Only primitive values are initialized.
        TreeMap fields are auto-instantiated by GenVM.
        """
        self.markets_count = 0

    # ═══════════════════════════════════════════════════════════════════
    # INTERNAL HELPER: REPUTABLE DOMAIN CHECK
    # ═══════════════════════════════════════════════════════════════════
    def _is_url_reputable(self, url: str) -> bool:
        """
        Checks if a URL belongs to one of the whitelisted reputable news sites.
        """
        allowed_domains = ["reuters.com", "apnews.com", "bloomberg.com", "nytimes.com", "bbc.com", "bbc.co.uk"]
        url_lower = url.lower().strip()
        
        if not (url_lower.startswith("http://") or url_lower.startswith("https://")):
            return False
            
        for domain in allowed_domains:
            if f"://{domain}" in url_lower or f".{domain}" in url_lower:
                return True
        return False

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: CREATE FACT-CHECKING MARKET
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def create_market(self, statement: str, expected_verdict: str, urls_json: str, betting_duration_seconds: int) -> int:
        """
        Creates a new fact-checking market. The creator must stake an initial amount of native GEN tokens.
        """
        if len(statement.strip()) == 0:
            raise UserError("Market news statement cannot be empty.")
            
        verdict_upper = expected_verdict.strip().upper()
        if verdict_upper not in ["TRUE", "FALSE"]:
            raise UserError("Expected verdict must be 'TRUE' or 'FALSE'.")
            
        if betting_duration_seconds <= 0:
            raise UserError("Betting duration must be positive.")
            
        stake_amount = int(gl.message.value)
        if stake_amount <= 0:
            raise UserError("Must stake a positive amount of GEN to create a market.")
            
        # Parse and validate URLs
        try:
            urls = json.loads(urls_json)
        except Exception:
            raise UserError("URLs parameter must be a valid JSON array of strings.")
            
        if not isinstance(urls, list):
            raise UserError("URLs parameter must be a list.")
            
        num_urls = len(urls)
        if num_urls < 3 or num_urls > 5:
            raise UserError("You must provide between 3 and 5 reference URLs.")
            
        for url in urls:
            if not isinstance(url, str):
                raise UserError("All URLs must be string type.")
            if not self._is_url_reputable(url):
                raise UserError(f"URL is not from a whitelisted reputable source: {url}")

        market_id = self.markets_count
        
        # Save market attributes
        self.market_statement[market_id]        = statement.strip()
        self.market_creator[market_id]          = gl.message.sender_account
        self.market_urls[market_id]             = urls_json
        
        current_time = int(datetime.now(timezone.utc).timestamp())
        self.market_end_time[market_id]         = current_time + betting_duration_seconds
        self.market_expected_verdict[market_id] = verdict_upper
        
        # Set default status
        self.market_resolved[market_id]         = False
        self.market_verdict[market_id]          = "PENDING"
        self.market_reason[market_id]           = "Awaiting AI cross-checking evaluation."
        
        # Initialize pools
        self.market_total_true[market_id]       = 0
        self.market_total_false[market_id]      = 0
        
        # Record initial stake (using lowercase address keys to avoid checksum case mismatch)
        user_addr_str = str(gl.message.sender_account).lower()
        stake_key = f"{market_id}:{user_addr_str}"
        
        if verdict_upper == "TRUE":
            self.user_stake_true[stake_key] = stake_amount
            self.market_total_true[market_id] = stake_amount
        else:
            self.user_stake_false[stake_key] = stake_amount
            self.market_total_false[market_id] = stake_amount
            
        self.markets_count = int(market_id) + 1
        return int(market_id)

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: PLACE BET ON ACTIVE MARKET
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def place_bet(self, market_id: int, verdict: str) -> None:
        """
        Bet native GEN tokens on the outcome of a news statement.
        """
        if market_id < 0 or market_id >= int(self.markets_count):
            raise UserError("Market does not exist.")
            
        if self.market_resolved.get(market_id, False):
            raise UserError("Market is already resolved.")
            
        current_time = int(datetime.now(timezone.utc).timestamp())
        if current_time >= int(self.market_end_time.get(market_id, 0)):
            raise UserError("Betting window has closed for this market.")
            
        verdict_upper = verdict.strip().upper()
        if verdict_upper not in ["TRUE", "FALSE"]:
            raise UserError("Verdict must be 'TRUE' or 'FALSE'.")
            
        stake_amount = int(gl.message.value)
        if stake_amount <= 0:
            raise UserError("Betting stake must be greater than zero.")
            
        user_addr_str = str(gl.message.sender_account).lower()
        stake_key = f"{market_id}:{user_addr_str}"
        
        if verdict_upper == "TRUE":
            self.user_stake_true[stake_key] = int(self.user_stake_true.get(stake_key, 0)) + stake_amount
            self.market_total_true[market_id] = int(self.market_total_true.get(market_id, 0)) + stake_amount
        else:
            self.user_stake_false[stake_key] = int(self.user_stake_false.get(stake_key, 0)) + stake_amount
            self.market_total_false[market_id] = int(self.market_total_false.get(market_id, 0)) + stake_amount

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: RESOLVE MARKET (AI CONSENSUS EVALUATION)
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def resolve_market(self, market_id: int) -> None:
        """
        Resolves the market by calling GenLayer's network of AI nodes to scrape references,
        aggregate info, issue a verdict, and achieve semantic consensus.
        """
        if market_id < 0 or market_id >= int(self.markets_count):
            raise UserError("Market does not exist.")
            
        if self.market_resolved.get(market_id, False):
            raise UserError("Market has already been resolved.")
            
        current_time = int(datetime.now(timezone.utc).timestamp())
        if current_time < int(self.market_end_time.get(market_id, 0)):
            raise UserError("Betting window is still open; cannot resolve yet.")
            
        urls_json = self.market_urls.get(market_id, "[]")
        statement = self.market_statement.get(market_id, "")
        
        # ── Non-Deterministic Evaluation Block (Rule 7) ────────────────
        def leader_fn() -> str:
            try:
                urls = json.loads(urls_json)
            except Exception:
                return json.dumps({
                    "error": "URL_JSON_PARSE_FAILED",
                    "verdict": "ERROR",
                    "reason": "Failed to parse URLs JSON in contract storage."
                })
                
            scraped_data = []
            failed_urls = 0
            
            # Scrape URLs using gl.nondet.web.render
            for url in urls:
                try:
                    page_text: str = gl.nondet.web.render(url)
                    if len(page_text.strip()) < 100:
                        # Handle extremely short page content (e.g. paywall/anti-bot)
                        scraped_data.append(f"Source URL: {url}\nContent: [Paywalled or text too short to scrape]")
                    else:
                        # Truncate content to avoid exceeding LLM context window
                        scraped_data.append(f"Source URL: {url}\nContent:\n{page_text[:4000]}")
                except Exception as e:
                    failed_urls += 1
                    scraped_data.append(f"Source URL: {url}\nFetch error: {str(e)}")
                    
            # If all URL fetches failed, fail gracefully rather than crashing the transaction
            if failed_urls == len(urls):
                return json.dumps({
                    "error": "ALL_SOURCES_FAILED",
                    "verdict": "ERROR",
                    "reason": "All references failed to resolve or render."
                })
                
            aggregated_context = "\n\n---\n\n".join(scraped_data)
            
            # Construct evaluation prompt for the LLM Oracle
            prompt = f"""You are an objective, decentralized fact-checking AI panel.
Your task is to analyze the following news statement and determine if it is TRUE or FALSE based ONLY on the provided news sources.

News Statement: "{statement}"

Below is the aggregated text scraped from the pre-defined news articles:
{aggregated_context}

Please carefully cross-reference the statement with the provided content. If the majority of sources substantiate the statement, rule it TRUE. If the sources refute the statement or prove it wrong, rule it FALSE.
If the content does not contain enough information to make a definitive ruling, or if the sources are contradictory or inconclusive, you should still choose the closest logical verdict based on the available text, or rule FALSE if it is unproven.

OUTPUT FORMAT:
You MUST respond with a valid JSON object matching the schema below. Do not include markdown ticks (e.g. ```json), explanations outside JSON, or formatting.
{{
  "verdict": "TRUE" | "FALSE",
  "reason": "<A concise, 2-3 sentence explanation summarizing your findings, citing specific sources and facts>"
}}"""

            # Run LLM via gl.nondet.exec_prompt
            raw_output = gl.nondet.exec_prompt(prompt)
            
            # Clean markdown formatting tags if returned by LLM
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                inner_lines = []
                for line in lines[1:]:
                    if line.strip() == "```":
                        break
                    inner_lines.append(line)
                cleaned = "\n".join(inner_lines).strip()
                
            try:
                parsed = json.loads(cleaned)
                verdict = str(parsed.get("verdict", "FALSE")).strip().upper()
                if verdict not in ["TRUE", "FALSE"]:
                    verdict = "FALSE"
                reason = str(parsed.get("reason", "No reason provided by AI.")).strip()
                
                return json.dumps({
                    "verdict": verdict,
                    "reason": reason[:1000]
                })
            except Exception as parse_err:
                return json.dumps({
                    "error": f"JSON_PARSE_FAILED: {str(parse_err)}",
                    "verdict": "ERROR",
                    "reason": f"AI output parsing failed. Raw response: {raw_output[:200]}"
                })
                
        def validator_fn(leader_result: str) -> bool:
            """
            Semantic validator. Verifies that independent validators arrive at the
            same logical verdict (TRUE or FALSE) as the leader, allowing for variance in reasons/formatting.
            """
            try:
                leader_data = json.loads(leader_result)
            except Exception:
                return False
                
            if "error" in leader_data:
                allowed_errors = {"URL_JSON_PARSE_FAILED", "ALL_SOURCES_FAILED", "JSON_PARSE_FAILED"}
                return any(err in str(leader_data.get("error", "")) for err in allowed_errors)
                
            validator_raw = leader_fn()
            try:
                validator_data = json.loads(validator_raw)
            except Exception:
                return True  # Abstain (agree) if validator node faces a local error
                
            if "error" in validator_data:
                return True  # Abstain if validator gets scraping/network error
                
            leader_verdict = str(leader_data.get("verdict", "")).strip().upper()
            validator_verdict = str(validator_data.get("verdict", "")).strip().upper()
            
            # Semantic alignment check: do they agree on the logical verdict?
            return leader_verdict == validator_verdict

        # Run Consensus Protocol
        consensus_json = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        
        try:
            res = json.loads(consensus_json)
        except Exception:
            self.market_resolved[market_id] = True
            self.market_verdict[market_id]  = "ERROR"
            self.market_reason[market_id]   = "Consensus failed: returned invalid state."
            return
            
        verdict = str(res.get("verdict", "ERROR")).strip().upper()
        reason = str(res.get("reason", "Consensus evaluation completed."))
        
        self.market_verdict[market_id]  = verdict
        self.market_reason[market_id]   = reason
        self.market_resolved[market_id] = True

    # ═══════════════════════════════════════════════════════════════════
    # PUBLIC METHOD: CLAIM WINNINGS OR REFUND
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.write
    def claim_winnings(self, market_id: int) -> int:
        """
        Allows winning bettors to claim their payout. If the market failed to resolve (ERROR state)
        or if nobody bet on the winning side, everyone can claim a 100% refund of their stake.
        """
        if market_id < 0 or market_id >= int(self.markets_count):
            raise UserError("Market does not exist.")
            
        if not self.market_resolved.get(market_id, False):
            raise UserError("Market is not resolved yet.")
            
        user_addr_str = str(gl.message.sender_account).lower()
        stake_key = f"{market_id}:{user_addr_str}"
        
        if self.user_has_claimed.get(stake_key, False):
            raise UserError("Winnings or refund already claimed.")
            
        verdict = self.market_verdict.get(market_id, "PENDING")
        
        # Scenario A: Market resolved in ERROR -> Refund 100% of stakes
        if verdict == "ERROR":
            true_stake = int(self.user_stake_true.get(stake_key, 0))
            false_stake = int(self.user_stake_false.get(stake_key, 0))
            refund_amount = true_stake + false_stake
            
            if refund_amount <= 0:
                raise UserError("No stake to refund.")
                
            self.user_has_claimed[stake_key] = True
            other = gl.get_contract_at(gl.message.sender_account)
            other.emit_transfer(value=u256(refund_amount))
            return refund_amount
            
        total_true = int(self.market_total_true.get(market_id, 0))
        total_false = int(self.market_total_false.get(market_id, 0))
        total_pool = total_true + total_false
        
        winning_pool = total_true if verdict == "TRUE" else total_false
        user_winning_stake = int(self.user_stake_true.get(stake_key, 0)) if verdict == "TRUE" else int(self.user_stake_false.get(stake_key, 0))
        
        # Scenario B: Nobody bet on the winning side -> Refund everyone's stakes
        if winning_pool == 0:
            true_stake = int(self.user_stake_true.get(stake_key, 0))
            false_stake = int(self.user_stake_false.get(stake_key, 0))
            refund_amount = true_stake + false_stake
            
            if refund_amount <= 0:
                raise UserError("No stake to refund.")
                
            self.user_has_claimed[stake_key] = True
            other = gl.get_contract_at(gl.message.sender_account)
            other.emit_transfer(value=u256(refund_amount))
            return refund_amount
            
        # Scenario C: Valid claim
        if user_winning_stake <= 0:
            raise UserError("You did not bet on the winning side, or have no stake to claim.")
            
        payout_amount = (user_winning_stake * total_pool) // winning_pool
        self.user_has_claimed[stake_key] = True
        
        other = gl.get_contract_at(gl.message.sender_account)
        other.emit_transfer(value=u256(payout_amount))
        return payout_amount

    # ═══════════════════════════════════════════════════════════════════
    # READ-ONLY VIEW METHODS
    # ═══════════════════════════════════════════════════════════════════
    @gl.public.view
    def get_market_count(self) -> int:
        """
        Returns the total number of markets created.
        """
        return int(self.markets_count)
        
    @gl.public.view
    def get_market(self, market_id: int) -> str:
        """
        Returns a JSON-serialized representation of a market.
        """
        if market_id < 0 or market_id >= int(self.markets_count):
            raise UserError("Market does not exist.")
            
        creator_addr = self.market_creator.get(market_id, gl.message.sender_account)
        
        return json.dumps({
            "id": market_id,
            "statement": self.market_statement.get(market_id, ""),
            "creator": str(creator_addr),
            "urls": json.loads(self.market_urls.get(market_id, "[]")),
            "end_time": int(self.market_end_time.get(market_id, 0)),
            "expected_verdict": self.market_expected_verdict.get(market_id, ""),
            "resolved": bool(self.market_resolved.get(market_id, False)),
            "verdict": self.market_verdict.get(market_id, "PENDING"),
            "reason": self.market_reason.get(market_id, ""),
            "total_true": int(self.market_total_true.get(market_id, 0)),
            "total_false": int(self.market_total_false.get(market_id, 0))
        })
        
    @gl.public.view
    def get_user_stake(self, market_id: int, user_addr: str) -> str:
        """
        Returns user stakes (true and false) and claiming status for a market.
        """
        stake_key = f"{market_id}:{user_addr.strip().lower()}"
        
        true_stake = int(self.user_stake_true.get(stake_key, 0))
        false_stake = int(self.user_stake_false.get(stake_key, 0))
        has_claimed = bool(self.user_has_claimed.get(stake_key, False))
        
        return json.dumps({
            "market_id": market_id,
            "user": user_addr.strip().lower(),
            "true_stake": true_stake,
            "false_stake": false_stake,
            "has_claimed": has_claimed
        })
