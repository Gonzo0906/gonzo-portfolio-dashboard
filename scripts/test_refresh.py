import json
from pathlib import Path
import unittest
from unittest.mock import patch
import refresh

class ProviderParsing(unittest.TestCase):
    def test_daily_change_uses_previous_session_not_range_start(self):
        fixture = {'chart': {'result': [{'meta': {'symbol':'NVDA','currency':'USD','regularMarketPrice':110,'regularMarketTime':172800,'chartPreviousClose':80}, 'timestamp':[0,86400,172800], 'indicators':{'quote':[{'close':[80,100,110]}]}}]}}
        with patch.object(refresh,'request',return_value=json.dumps(fixture).encode()):
            _, quote = refresh.stock('NVDA')
        self.assertAlmostEqual(quote['dailyPct'],10)
    def test_wrong_symbol_is_unavailable(self):
        fixture={'chart':{'result':[{'meta':{'symbol':'SPCK','currency':'USD'}}]}}
        with patch.object(refresh,'request',return_value=json.dumps(fixture).encode()):
            _, quote=refresh.stock('SPCX')
        self.assertIsNone(quote['price'])
        self.assertEqual(quote['status'],'unavailable')
    def test_crypto_catalog_mismatch_never_guessed(self):
        responses=[json.dumps([{'id':'pi-network','symbol':'not-pi'}]).encode(),b'{}']
        with patch.object(refresh,'request',side_effect=responses):
            quote=refresh.crypto([['PI',1037.65,'pi-network','Pi Network']])['PI']
        self.assertIsNone(quote['price'])

if __name__=='__main__':
    unittest.main()
