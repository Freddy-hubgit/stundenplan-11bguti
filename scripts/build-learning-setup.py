from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=sorted((root/'supabase/migrations').glob('20261111003[2-6]_*.sql'))
parts=['-- Einmaliges Gesamtpaket 032–036. Voraussetzung: vorhandene Einrichtung 001–030.\n-- Nicht zusätzlich zu denselben einzeln ausgeführten Migrationen ausführen.\n-- Migration 031 (Profilbilder) ist unabhängig. Bestehende Noten/Termine werden nicht gelöscht.\nbegin;\n']
for path in files:
    text=path.read_text().strip()
    assert text.startswith('begin;') and text.endswith('commit;'),path
    parts.append('-- '+path.name+'\n'+text[6:-7].strip()+'\n')
parts.append("notify pgrst,'reload schema';\ncommit;\n")
(root/'supabase/setup/learning-suite.sql').write_text('\n'.join(parts))
