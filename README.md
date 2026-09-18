# Neon Alley: Pen Tool Designer

A game that teaches the Adobe Illustrator pen tool. You work in a sign shop: each job is a neon tube you have to trace with anchors and handles, and the plotter charges by the point. Fifteen jobs across three shops, from straight corners to letterforms.

It runs in any modern browser, needs no account and installs nothing. Progress is saved in the player's own browser.

- `public/index.html`: the whole game in one file. This is the only file a player loads.
- `server.js`: a small web server with no dependencies (Node.js 18+)
- `src/`: the game in separate files, if you want to change it (see "Editing the game" below)

---

## Put it online for free with Render (about 10 minutes)

You need a free **GitHub** account (to hold the files) and a free **Render** account (to serve them).

### 1. Upload the files to GitHub
1. Go to https://github.com and sign up or log in.
2. Click **+** (top right), then **New repository**. Name it `neon-alley`, keep it **Public**, and click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Unzip `neon-alley.zip` on your computer, open the unzipped folder, and drag **everything inside it** onto the GitHub page: `server.js`, `package.json`, `README.md`, and the `public` and `src` folders.
   - Check that `public/index.html` appears in the upload list. That file is the game.
5. Click **Commit changes**.

### 2. Run it on Render
1. Go to https://render.com and sign up with your GitHub account.
2. Click **New +**, then **Web Service**, and pick your `neon-alley` repository. You may need to give Render access to it first.
3. Fill in:
   - **Language / Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. Click **Create Web Service**. After a minute or two the log ends with `Neon Alley running…`.
5. Your address is at the top of the page, something like `https://neon-alley-xxxx.onrender.com`. Send that to your students.

**Good to know:** on Render's free plan the server sleeps after 15 minutes with no visitors, so the first load after a quiet spell takes about a minute. After that it is instant.

### Simpler option
The game is one self-contained file. If you already have somewhere to put files (a college web server, Netlify, GitHub Pages), just upload `public/index.html` on its own. The server here is only needed if you want to run it yourself.

---

## The jobs

| Shop | # | Job | Par | What it drills |
| --- | --- | --- | --- | --- |
| Bulb Row | 1 | Arrow sign | 7 | Clicking corners |
| Bulb Row | 2 | Pennant | 4 | Closing a path |
| Bulb Row | 3 | Full moon | 4 | Click and drag, points at the turns |
| Bulb Row | 4 | Crescent | 4 | Corners and curves in one path |
| Bulb Row | 5 | Arch sign | 5 | Straight into curved, then editing (the customer changes their mind) |
| Decal Depot | 6 | Teardrop | 3 | Alt-drag to break a handle |
| Decal Depot | 7 | Ocean wave | 4 | A chain of curves, and an open path |
| Decal Depot | 8 | Awning | 5 | Shift to constrain, and scallops |
| Decal Depot | 9 | Leaf | 4 | Two broken handles in one shape |
| Decal Depot | 10 | Shield badge | 5 → 6 | Adding a point to a path you already drew |
| Letterpress Lane | 11 | Letter C | 10 | The turning-point rule on a letterform |
| Letterpress Lane | 12 | Letter S | 4 | Keeping the tangent through a reversal |
| Letterpress Lane | 13 | Letter J | 4 | A straight running into a curve without a kink |
| Letterpress Lane | 14 | Ampersand flourish | 5 | A long path, no markers |
| Letterpress Lane | 15 | The Alley bolt | 7 | Precision corners, nothing snaps |

Help fades as students go: Bulb Row shows markers where the points belong and snaps to them, Decal Depot shows them only after a failed attempt, Letterpress Lane shows nothing.

## Scoring

- **Fit**: the path is sampled and compared to the target. Within 2 units of a 1000-unit-wide mat is clean, up to 6 passes, beyond that the job fails.
- **Points**: anchors against the job's par.
- **Tangents**: a kink where the design is round is a fault; a rounded-off corner is a fault too.
- One star for a shape that fits, two for fitting within par plus one, three for par with a clean fit and no kinks.
- Hilda names only the single worst problem, so a student knows what to fix next.

## Keys (the same ones Illustrator uses)

| Key | Does |
| --- | --- |
| Click | Corner point |
| Click and drag | Curve point |
| Click the first point | Close the shape |
| Alt / Option drag | Break a handle |
| Alt / Option click the last point | End the curve there, so the next segment is straight |
| Shift | Constrain to 45° |
| Esc | Finish an open path |
| A, or hold Cmd / Ctrl | Direct selection: move points and handles |
| Shift + C | Convert a point between corner and smooth |
| Plus / Minus | Add a point on the path, remove the one under the cursor |
| Cmd / Ctrl + Z | Undo (add Shift to redo) |

On phones and tablets: tap for a corner, tap and drag for a curve. The Break and Straight buttons stand in for Alt and Shift; tap one, then make your gesture. A magnifier shows what is under your finger from a corner of the screen, and can be switched off under **?**.

## Adding your own jobs

In the game, open **Jobs**, then **Workshop**. Paste a path from Illustrator (select the shape, File → Export → SVG, open the file in a text editor and copy what is inside `d="…"`), give it a name and a par, and it becomes a job. Straight lines and curves only: the pen tool never makes arcs, so arcs are refused. Jobs you add are saved in that browser.

## Job cards

**Jobs → Job card** draws a card with every job, the stars earned, the points used and a small picture of the student's own path, and offers to save it as an image. That is the thing to hand in.

## Editing the game

`public/index.html` is generated. To change anything, edit the files in `src/` and rebuild:

```
python3 src/build.py     # writes public/index.html
node src/test_pen.js     # checks the scoring against all 15 shapes
```

- `src/pen.js`: path maths and scoring. No browser code, so it runs in Node for testing.
- `src/jobs.js`: the fifteen shapes, their pars, briefs and tips. Add a job by adding an entry here.
- `src/game.js`: canvas drawing, pen behavior, the shop screens.
- `src/index.html`: markup and styles.

If Python is not handy, `src/build.py` only concatenates: paste the three scripts into `src/index.html` inside `<script>` tags, wrap it in a normal HTML document, and save it as `public/index.html`.
