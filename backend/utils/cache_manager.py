import time
from functools import lru_cache

class InsightCache:
    """
    Simple TTL-based in-memory cache for expensive financial data and AI results.
    """
    def __init__(self):
        self._cache = {}

    def get(self, key):
        if key in self._cache:
            data, expiry = self._cache[key]
            if time.time() < expiry:
                return data
            else:
                del self._cache[key]
        return None

    def set(self, key, value, ttl_seconds=300):
        self._cache[key] = (value, time.time() + ttl_seconds)

    def clear(self):
        self._cache.clear()

# Global singleton instances for different data types
market_cache = InsightCache()    # 5-min default
sentiment_cache = InsightCache() # 1-hour default (news headlines don't change that fast)
prediction_cache = InsightCache()# 10-min default
rag_cache = InsightCache()       # 2-hour default
