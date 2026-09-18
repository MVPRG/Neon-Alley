# Builds public/index.html from the files in src/. Run from the project root:
#   python3 src/build.py
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'src')
read = lambda n: open(os.path.join(src, n), encoding='utf-8').read()
shell, pen, jobs, game = read('index.html'), read('pen.js'), read('jobs.js'), read('game.js')
scripts = "<script>\n%s\n</script>\n<script>\n%s\n</script>\n<script>\n%s\n</script>\n" % (pen, jobs, game)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="description" content="Learn the Adobe Illustrator pen tool by cutting neon signs.">\n'
        '<meta name="theme-color" content="#0d1215">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E%E2%9C%92%EF%B8%8F%3C/text%3E%3C/svg%3E">\n')
body = shell.replace('<canvas id="mat"', '</head>\n<body>\n<canvas id="mat"', 1)
out = head + body + "\n" + scripts + "</body>\n</html>\n"
dest = os.path.join(root, 'public', 'index.html')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w', encoding='utf-8').write(out)
print('wrote', dest, len(out), 'bytes')
