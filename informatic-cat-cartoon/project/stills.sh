#!/bin/bash
# usage: stills.sh frame1 frame2 ...  → snapshots/f<frame>.png + sheet.png
set -e
R=/home/user/Karel/OpenMontage; P=$R/projects/informatic-cat
B=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
python3 -c "
import sys; sys.path.insert(0,'$R')
from pathlib import Path
from tools.video.video_compose import VideoCompose
VideoCompose()._stage_atelier_project(Path('$P/index.tsx'), Path('$R/remotion-composer'))" >/dev/null
cd $R/remotion-composer
ins=(); 
for f in "$@"; do
  npx remotion still projects/informatic-cat/index.tsx InformaticCat $P/snapshots/f$f.png --frame=$f --props=$P/artifacts/props.json --public-dir=$P/public --scale=0.4 --browser-executable=$B --log=error
  ins+=(-i $P/snapshots/f$f.png)
done
ffmpeg -v error -y "${ins[@]}" -filter_complex hstack=inputs=$# $P/snapshots/sheet.png
