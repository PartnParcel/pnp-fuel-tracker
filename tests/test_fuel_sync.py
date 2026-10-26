import importlib.util
import pathlib
import unittest
import datetime
spec=importlib.util.spec_from_file_location('sync',pathlib.Path(__file__).parents[1]/'ops/fuel-sync.py')
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
def data(list_rate=47.5):
    return {'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'carriers':[{'name':'Canada Post','url':'https://example.com','status':'ok','lastVerified':'2026-10-26','services':[{'service':'Domestic Services','current':40.3,'previous':39.9,'listRate':list_rate}]}]}
class RenderTests(unittest.TestCase):
    def test_relief_and_mobile_note(self):
        html=sync.render(data());self.assertIn('40.30%',html);self.assertIn('<s>47.50%</s>',html);self.assertIn('ch-inline',html)
    def test_relief_removal(self):
        self.assertNotIn('Temporary rate',sync.render(data(None)))
    def test_old_feed_never_claims_verified(self):
        d=data();d['generatedAt']='2025-01-01T00:00:00Z';self.assertIn('pnp-verified stale',sync.render(d))
    def test_prior_week_is_stale_even_when_feed_is_recent(self):
        d=data();d['carriers'][0]['lastVerified']='2025-01-01'
        self.assertIn('pnp-verified stale',sync.render(d))
    def test_failed_feed_preserves_rates_and_marks_labels_only(self):
        html=sync.render(data())
        stale=sync.mark_stale(html)
        self.assertIn('pnp-verified stale',stale)
        self.assertIn('40.30%',stale)
        self.assertIn('<s>47.50%</s>',stale)
        self.assertEqual(sync.mark_stale(stale),stale)
        self.assertEqual(sync.mark_stale('<p>Unrelated widget</p>'),'<p>Unrelated widget</p>')
    def test_source_period_is_visible_and_expired_rate_is_stale(self):
        d=data();d['carriers'][0]['services'][0].update(effectiveDate='2025-01-04',effectiveTo='2025-01-10')
        rendered=sync.render(d)
        self.assertIn('Applies 2025-01-04–2025-01-10',rendered)
        self.assertIn('pnp-verified stale',rendered)
    def test_source_text_escaped(self):
        d=data();d['carriers'][0]['services'][0]['service']='<script>bad</script>';self.assertIn('&lt;script&gt;',sync.render(d))
    def test_cached_older_feed_cannot_replace_newer_rows(self):
        base='<tbody id="pnp-fuel-tbody">old</tbody>'
        newer=sync.replace_rows(base,base,'new','2026-10-26T19:20:12.842Z')
        self.assertEqual(sync.replace_rows(newer,newer,'cached','2026-10-26T17:49:31.362Z'),newer)
        self.assertEqual(sync.replace_rows(newer,newer,'new','2026-10-26T19:20:12.842Z'),newer)
        advanced=sync.replace_rows(newer,newer,'next','2026-11-02T12:00:00Z')
        self.assertIn('>next</tbody>',advanced)
        self.assertEqual(advanced.count('pnp-fuel-generated-at:'),1)
if __name__=='__main__':unittest.main()
