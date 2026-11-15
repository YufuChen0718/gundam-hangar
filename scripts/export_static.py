"""Run inside Blender with the original .blend already loaded; does not save the source."""
import bpy,sys,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
path=Path(a.output)/'public/assets/models/mecha-original.glb';path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.data.objects:
 if ob.type=='MESH':ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,use_selection=True)
