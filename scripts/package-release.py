from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
destination = root / 'artifacts' / ('SwissCourt-' + version + '.zip')
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in ['server.mjs', 'README.md', 'CHANGELOG.md', 'REQUIREMENTS.md']:
        archive.write(root / relative, relative)
    for item in (root / 'dist').rglob('*'):
        if item.is_file():
            archive.write(item, item.relative_to(root).as_posix())
    for item in (root / 'node_modules').rglob('LICENSE*'):
        if item.is_file():
            archive.write(item, 'third-party/' + item.relative_to(root / 'node_modules').as_posix())
    archive.writestr('START-WINDOWS.cmd', '@echo off\r\ncd /d "%~dp0"\r\nnode server.mjs\r\npause\r\n')
    archive.writestr('START-HERE.txt', 'SwissCourt ' + version + '\n\nДля локального запуска нужен Node.js 22 или новее.\nWindows: запустите START-WINDOWS.cmd.\nИли выполните: node server.mjs\nОткройте http://127.0.0.1:4174\n\nУстановка npm-зависимостей для этого готового пакета не нужна.\nДля телефона используйте размещённое приложение по HTTPS.\n')
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
(destination.parent / 'SHA256SUMS.txt').write_text(digest + '  ' + destination.name + '\n', encoding='ascii')
print(json.dumps({'path':str(destination),'bytes':destination.stat().st_size,'sha256':digest}))
