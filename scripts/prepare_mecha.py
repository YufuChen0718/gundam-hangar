"""Reproducible single-arm asset preparation preserving continuous joint boundaries.
Usage: Blender -b SOURCE.blend --disable-autoexec --python scripts/prepare_mecha.py -- --output PROJECT
Original geometry/UVs are preserved. Shared source vertices receive identical skin weights across parts.
"""
import bpy, json, math, sys, argparse, collections
from pathlib import Path
from mathutils import Vector, Matrix
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output)
for folder in ['assets-src','public/assets/models','docs/results']:(out/folder).mkdir(parents=True,exist_ok=True)
source=bpy.data.objects['Mesh_0'];mesh=source.data;material=mesh.materials[0]
verts=[v.co.copy() for v in mesh.vertices];faces=[list(f.vertices) for f in mesh.polygons]
uvs=[[tuple(mesh.uv_layers.active.data[i].uv) for i in f.loop_indices] for f in mesh.polygons]
normals=[[tuple(mesh.corner_normals[i].vector) for i in f.loop_indices] for f in mesh.polygons]
shoulder=Vector((-.285,.235,.535));elbow=Vector((-.325,.285,.390));wrist=Vector((-.415,.180,.085));grip=Vector((-.435,.110,-.015))
outline=[(-.49,.75),(-.205,.75),(-.225,.54),(-.238,.43),(-.26,.30),(-.295,.16),(-.335,.075),(-.335,-.11),(-.53,-.11),(-.53,.2),(-.45,.43)]
def inside(x,z):
 hit=False
 for i,(a,b) in enumerate(outline):
  c,d=outline[i-1]
  if (b>z)!=(d>z) and x<(c-a)*(z-b)/(d-b)+a:hit=not hit
 return hit
parents=list(range(len(verts)))
def find(i):
 while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
 return i
for e in mesh.edges:
 ra,rb=find(e.vertices[0]),find(e.vertices[1])
 if ra!=rb:parents[rb]=ra
components=collections.defaultdict(list)
for i in range(len(verts)):components[find(i)].append(i)
shield_ids=set(next(ids for ids in components.values() if len(ids)<1000))
labels={k:[] for k in ['body','upperArm','forearm','hand','rifle','shield']}
for i,f in enumerate(faces):
 x,y,z=sum((verts[j] for j in f),Vector())/len(f)
 if f[0] in shield_ids:label='shield'
 elif x<-.27 and -.65<z<.30 and ((z>-.11 and y<.10-.40*z) or (z<=-.11 and (x<-.44 or y<-.03))):label='rifle'
 elif (x<-.17 and y>.10 and .53<z<.75) or inside(x,z):label='upperArm' if z>.405 else 'forearm' if z>.085 else 'hand'
 else:label='body'
 labels[label].append(i)
# Eliminate disconnected fragments selected by coarse spatial boundaries.
def face_components(ids):
 incident=collections.defaultdict(list)
 for i in ids:
  for j in faces[i]:incident[j].append(i)
 todo=set(ids);groups=[]
 while todo:
  stack=[todo.pop()];part=[]
  while stack:
   i=stack.pop();part.append(i)
   for j in faces[i]:
    for n in incident[j]:
     if n in todo:todo.remove(n);stack.append(n)
  groups.append(part)
 return sorted(groups,key=len,reverse=True)
cleanup=[]
for label,destination in [('upperArm','body'),('forearm','rifle'),('rifle','body')]:
 groups=face_components(labels[label]);labels[label]=groups[0]
 for group in groups[1:]:labels[destination].extend(group);cleanup.append({'from':label,'to':destination,'faces':len(group)})
# A source vertex is assigned weights once, before material/part separation.
# Reusing these exact weights for every duplicate guarantees no motion cracks along shared boundaries.
bone_for={'body':'torso','upperArm':'rightShoulder','forearm':'rightElbow','hand':'rightWrist','rifle':'rightWrist','shield':'torso'}
scores=[collections.defaultdict(float) for _ in verts]
for label,ids in labels.items():
 for i in ids:
  f=faces[i];area=max((verts[f[1]]-verts[f[0]]).cross(verts[f[2]]-verts[f[0]]).length/2,1e-10)
  for j in f:scores[j][bone_for[label]]+=area
weights=[]
for s in scores:
 total=sum(s.values());weights.append({k:v/total for k,v in s.items()})
# Smooth only a narrow topological band around already mixed boundaries; armor interiors stay rigid.
adjacency=[set() for _ in verts]
for f in faces:
 for i in f:adjacency[i].update(j for j in f if j!=i)
boundary={i for i,w in enumerate(weights) if len(w)>1}
for _ in range(2):
 active=boundary|{j for i in boundary for j in adjacency[i]};updated=[dict(w) for w in weights]
 for i in active:
  acc=collections.defaultdict(float)
  for b,w in weights[i].items():acc[b]+=.5*w
  for j in adjacency[i]:
   for b,w in weights[j].items():acc[b]+=.5*w/max(1,len(adjacency[i]))
  updated[i]={b:w for b,w in acc.items() if w>1e-8}
 weights=updated
# Weapon-boundary vertices must have exactly the same rigid wrist transform as the independent weapon.
weapon_vertices={v for i in labels['rifle'] for v in faces[i]}
for i in weapon_vertices:weights[i]={'rightWrist':1.0}
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
root=bpy.data.objects.new('displayRoot',None);bpy.context.collection.objects.link(root);root.location.z=-min(v.z for v in verts)
armdata=bpy.data.armatures.new('RightArmSkeleton');arm=bpy.data.objects.new('RightArmSkeleton',armdata);bpy.context.collection.objects.link(arm);arm.parent=root
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
positions={'torso':Vector(),'head':Vector((0,0,.72)),'rightShoulder':shoulder,'rightElbow':elbow,'rightWrist':wrist,'leftShoulder':Vector((.30,.23,.53)),'leftElbow':Vector((.34,.25,.37)),'leftWrist':Vector((.40,.18,.08))}
parent_names={'head':'torso','rightShoulder':'torso','rightElbow':'rightShoulder','rightWrist':'rightElbow','leftShoulder':'torso','leftElbow':'leftShoulder','leftWrist':'leftElbow'}
for name,pos in positions.items():
 b=armdata.edit_bones.new(name);b.head=pos;b.tail=pos+Vector((0,0,.08));b.use_deform=True
 if name in parent_names:b.parent=armdata.edit_bones[parent_names[name]]
bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
def socket(name,bone,pos):
 ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.parent=arm;ob.parent_type='BONE';ob.parent_bone=bone;bpy.context.view_layer.update()
 ob.matrix_world=Matrix.Translation(pos+root.location);return ob
right=socket('rightHand','rightWrist',grip);socket('leftHand','leftWrist',positions['leftWrist']);socket('back','torso',Vector((0,.25,.45)))
barrel=Vector((-.29,-.46,-.81)).normalized();q=Vector((0,-1,0)).rotation_difference(barrel)
right.matrix_world=Matrix.Translation(grip+root.location)@q.to_matrix().to_4x4()
offset=bpy.data.objects.new('rifleOffset',None);bpy.context.collection.objects.link(offset);offset.parent=right;offset.rotation_mode='QUATERNION';offset.rotation_quaternion=q.inverted()
parts={};seam_records=collections.defaultdict(list)
for label,ids in labels.items():
 used=sorted({v for i in ids for v in faces[i]});mapping={v:j for j,v in enumerate(used)};pivot=grip if label=='rifle' else Vector()
 data=bpy.data.meshes.new(label+'Mesh');data.from_pydata([verts[v]-pivot for v in used],[],[[mapping[v] for v in faces[i]] for i in ids]);data.update();data.materials.append(material)
 uv=data.uv_layers.new(name='UVMap');loop_normals=[]
 for f,i in zip(data.polygons,ids):
  for li,co in zip(f.loop_indices,uvs[i]):uv.data[li].uv=co
  f.use_smooth=True;loop_normals.extend(normals[i])
 data.normals_split_custom_set(loop_normals)
 ob=bpy.data.objects.new(label,data);bpy.context.collection.objects.link(ob);parts[label]=ob
 if label=='rifle':ob.parent=offset
 else:
  ob.parent=arm
  for bone in positions:
   vg=ob.vertex_groups.new(name=bone)
   for src,local in mapping.items():
    w=weights[src].get(bone,0)
    if w>0:vg.add([local],w,'REPLACE')
  mod=ob.modifiers.new('SharedBoundarySkin','ARMATURE');mod.object=arm
  for src,local in mapping.items():seam_records[src].append((label,local))
# Validate actual evaluated vertex positions in several poses before saving/exporting.
checks=[]
for angle1,angle2,angle3 in [(0,0,0),(20,40,0),(30,55,0),(55,85,20)]:
 for name,angle in [('rightShoulder',angle1),('rightElbow',angle2),('rightWrist',angle3)]:
  pb=arm.pose.bones[name];pb.rotation_mode='XYZ';pb.rotation_euler=(math.radians(-angle),0,0) if name!='rightWrist' else (0,0,math.radians(angle))
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();evaluated={name:ob.evaluated_get(dg) for name,ob in parts.items()};evaluated_meshes={name:ob.to_mesh() for name,ob in evaluated.items()}
 worst=0;count=0
 for src,records in seam_records.items():
  samples=[evaluated[name].matrix_world@evaluated_meshes[name].vertices[idx].co for name,idx in records]
  if src in weapon_vertices:
   # Weapon mesh index is obtained by the sorted source-ID mapping.
   wi=sorted(weapon_vertices).index(src);samples.append(evaluated['rifle'].matrix_world@evaluated_meshes['rifle'].vertices[wi].co)
  if len(samples)>1:count+=1;worst=max(worst,max((a-samples[0]).length for a in samples))
 for ob in evaluated.values():ob.to_mesh_clear()
 checks.append({'angles_deg':[angle1,angle2,angle3],'shared_vertices_checked':count,'max_boundary_separation_m':worst})
 if worst>1e-5:raise RuntimeError('Shared boundary validation failed: '+str(worst))
for pb in arm.pose.bones:pb.rotation_euler=(0,0,0)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'assets-src/mecha-right-arm.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'public/assets/models/mecha-right-arm.glb'),export_format='GLB',export_yup=True,export_animations=False)
report={'source_triangles':len(faces),'part_triangles':{k:len(v) for k,v in labels.items()},'source_faces_preserved':sum(map(len,labels.values()))==len(faces),'articulated_joints':['rightShoulder','rightElbow','rightWrist'],'method':'Shared vertex skin weights across separated parts, rigid armor interiors with narrow weighted joint bands; independent wrist-attached rifle.','cleanup':cleanup,'seam_checks':checks,'limitations':['Single-arm prototype, no full-body animation','Joint bands can deform slightly; collision avoidance is not implemented','One shared textured material; armor recoloring remains future work']}
(out/'docs/results/preparation-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));print('CONTINUOUS_ARM_COMPLETE')
