#!/usr/bin/env bash
# Copy the RobotATC design studio (RobotATC/viewer) into this site under studio/, with only the vendor meshes the
# 45 design URDFs reference (HEBI hebi_description, Apache-2.0; LICENSE copied alongside).
set -e
V=/mnt/storage/jangseop-park/workspace/ATC/RobotATC/viewer
S=$(cd "$(dirname "$0")" && pwd)/studio
mkdir -p "$S/data" "$S/urdf/designs" "$S/meshes/hebi"
cp "$V"/index.html "$V"/app.js "$V"/style.css "$V"/three.min.js "$V"/OrbitControls.js "$V"/STLLoader.js "$S"/
cp "$V"/data/*.json "$S/data/"
cp "$V"/urdf/designs/*.urdf "$S/urdf/designs/"
grep -oh 'filename="[^"]*"' "$V"/urdf/designs/*.urdf | sort -u | sed 's/filename="//; s/"//' | while read -r m; do cp "$V/$m" "$S/meshes/hebi/"; done
cp "$V"/../vendor/hebi_description/LICENSE "$S/meshes/hebi/LICENSE-hebi_description"
# inside the site the project page is one level up
sed -i 's|href="https://robotatc.github.io"|href="../"|' "$S/index.html"
echo "studio synced: $(ls "$S/data" | wc -l) data files, $(ls "$S/meshes/hebi" | grep -c stl) meshes, $(du -sh "$S" | cut -f1)"
