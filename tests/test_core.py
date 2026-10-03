import tempfile, unittest
from pathlib import Path
from agentcapsule.core import CapsuleError, install, load
ROOT=Path(__file__).parents[1]
class TestCore(unittest.TestCase):
 def test_load(self):
  meta, role, skills=load(ROOT,'researcher'); self.assertEqual(meta['name'],'researcher'); self.assertEqual(set(skills),{'web-research','source-verification'})
 def test_adapters_and_manifest(self):
  for target, role in [('claude','CLAUDE.md'),('codex','AGENTS.md'),('pi','.pi/APPEND_SYSTEM.md')]:
   with tempfile.TemporaryDirectory() as d:
    m=install(ROOT,'researcher',target,Path(d),profile='fast'); self.assertTrue((Path(d)/role).is_file()); self.assertEqual(m['target'],target); self.assertTrue((Path(d)/'agentcapsule-install.json').is_file())
 def test_collision_fails_without_partial_write(self):
  with tempfile.TemporaryDirectory() as d:
   out=Path(d); (out/'CLAUDE.md').write_text('existing')
   with self.assertRaises(CapsuleError): install(ROOT,'researcher','claude',out)
   self.assertEqual([p.name for p in out.iterdir()],['CLAUDE.md'])
 def test_bad_agent_fails(self):
  with self.assertRaises(CapsuleError): load(ROOT,'missing')
if __name__=='__main__': unittest.main()
