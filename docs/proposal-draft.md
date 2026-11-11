<!-- Original proposal draft (pre-revision). Source material for T00; the route has since changed to desktop-first, see docs/PLAN.md -->

Mecha Hangar
An Interactive Mecha Customization and Animation System for Desktop and Apple Vision Pro
CS184 Final Project Proposal

Team Members: [Member 1], [Member 2], [Member 3], [Member 4]
Project Website: [Insert published website URL]
1. Summary
We propose an interactive mecha customization and animation system for desktop browsers and Apple Vision Pro, allowing users to inspect a Gundam-inspired robot, modify its colors, swap equipment, and play animated actions. Starting from AI-generated or existing model assets, we will implement modular equipment attachment, keyframe animation with smooth transitions, and selection and manipulation controls for desktop and immersive environments. We will evaluate the system through interactive demonstrations, animation comparisons, attachment correctness checks, and performance measurements.
2. Problem Description
Mecha models feature articulated structures, distinct armor regions, and interchangeable equipment, making them suitable for exploring interactive 3D graphics. However, turning a static model into a customizable, animated experience introduces several connected challenges: equipment assets may use different scales and coordinate conventions, attachments must remain aligned during motion, discrete poses must become continuous animations, and interactions must work across desktop and spatial input systems.

Our project will transform a static mecha asset into an interactive virtual hangar. Users will customize and animate the robot on a desktop, then access the same configuration in an immersive Vision Pro experience.

The main challenges are:
- Attachment consistency: Maintaining the correct position and orientation of interchangeable equipment throughout animation.
- Animation continuity: Generating motion between keyframes and avoiding abrupt pose changes when users switch actions.
- Cross-device interaction: Mapping mouse and XR inputs to consistent operations while handling coordinate transformations and interaction states.
- Real-time performance: Balancing model detail, materials, and shadows against responsive rendering.
We will limit the project to one robot, a small equipment collection, and a few upper-body actions. This scope allows us to focus on implementing and evaluating the graphics system rather than producing a large asset library.
3. Technical Approach
3.1 Asset Preparation and Modular Attachments
We plan to obtain a base mecha model using Meshy or another documented asset source. We will use Blender to standardize scale and orientation, organize material regions, and prepare an articulated structure. The robot, weapons, and backpack will be managed as separate assets.

The robot will use either a skeleton or a hierarchy of rigid components, depending on the selected asset. Weapons and accessories will attach to predefined sockets on the hands and back. Each attachment will include an asset-specific offset that accounts for its grip position and orientation.

The equipment’s world transformation will be computed as:
\[
M_{\text{equipment}}^{\text{world}}
=
M_{\text{joint}}^{\text{world}}
M_{\text{socket}}^{\text{joint}}
M_{\text{equipment}}^{\text{socket}}
\]
We will implement equipment configuration, attachment offsets, replacement, and removal. We will verify that attachments remain aligned across different poses and animations.

Asset suitability will be tested early. If a generated model cannot be articulated reliably or produces excessive armor deformation, we will use a simplified model with separate rigid components.
3.2 Keyframe Animation and Smooth Transitions
We will author key poses for three actions: idle, aiming a rifle, and swinging a sword. Each pose will store local rotations for the relevant joints.

At each frame, the system will identify the surrounding keyframes and interpolate joint rotations according to the current playback time. We will use quaternion spherical linear interpolation and timing curves to control motion between poses.

When the user changes actions, the system will capture the current pose and blend toward the new animation over a short transition interval. An animation state machine will manage playback, interruption, completion, and coordination with equipment changes.

The baseline animations will primarily involve the upper body, with the feet remaining on the display platform. This avoids introducing locomotion, ground contact, and whole-body balance into the core scope.

We will use Three.js quaternion operations while implementing our own pose data organization, time-based animation evaluation, playback control, and transition logic. We will distinguish these contributions from the library’s underlying mathematical operations. Three.js Quaternion Documentation
3.3 Desktop and Spatial Interaction
Both modes will share the same model, material, equipment, and animation state.

The desktop interface will provide model rotation and zoom, along with tabs for appearance, equipment, and animation. The Vision Pro interface will use a fixed display platform and a compact spatial menu for model rotation, customization, and action playback.

We will use ray-based selection and implement target filtering, selection state, manipulation offsets, rotation mapping, and release or cancellation behavior. Customization settings will persist when entering or leaving immersive mode.

The Vision Pro experience will use WebXR. We will validate immersive session entry, input handling, and rendering on the actual device during the first week. Apple provides an implementation and testing workflow for immersive WebXR experiences in Safari. Apple: Build Immersive Web Experiences with WebXR
3.4 Starting Point and Team Contributions
Existing resources and capabilities	Work implemented by our team
Generated or existing geometry, textures, and potentially an automatically generated rig	Asset preparation, material organization, joint configuration, and attachment sockets
Three.js rendering, scene management, quaternion operations, and ray intersection utilities	Equipment assembly logic, keyframe evaluation, animation states, and transitions
WebXR view and input data	Input adaptation, object selection and manipulation, spatial menus, and state synchronization
Browser and device runtime	Scene optimization, performance evaluation, and comparison experiments


We will document the assets, libraries, and examples used. Our report and presentation will explicitly compare the initial assets with the final interactive system.
4. Goals and Deliverables
4.1 Planned Deliverables: Baseline
A complete customization and animation workflow

The system will include:
- One articulated Gundam-inspired mecha.
- Three color presets and editable colors for major armor regions.
- Two interchangeable handheld weapons: a rifle and a beam sword.
- One removable backpack.
- Idle, aiming, and sword-swing animations with smooth transitions.
Equipment changes will initially use menu selections. The baseline will not require physics simulation or free-form drag-and-drop assembly.

Desktop and Vision Pro experiences

The desktop version will support inspection, customization, and animation playback.

The Vision Pro version will support entering the immersive hangar, observing the model from different viewpoints, rotating it, and using spatial menus to change its appearance, equipment, and actions.

The baseline uses a virtual hangar. Real-world room reconstruction, physical tabletop placement, and real-world occlusion are outside its scope.

A complete demonstration

Our final demonstration will follow a clear sequence:
Enter the hangar → inspect and rotate the mecha → change its colors → equip the sword → play a sword swing → switch to the rifle → transition into an aiming pose.

Public project materials

We will deliver:
- A persistent project website and desktop demonstration.
- A Vision Pro entry point and usage instructions.
- Attachment and animation comparison materials.
- Performance measurements and charts.
- Source code, setup instructions, and asset attribution.
- The required reports, videos, presentation slides, and a short showcase clip of the system’s output.
4.2 Aspirational Deliverable: Drag-and-Snap Assembly
If the baseline is completed early, we will implement interactive weapon placement.

Users will select and move a weapon toward a compatible attachment socket. When its position and orientation satisfy predefined thresholds, the system will display an attachment preview. Releasing the weapon will align and attach it to the socket.

This extension builds directly on our spatial interaction and attachment systems. It introduces proximity tests, orientation constraints, and coordinate conversion without requiring a full rigid-body physics engine.

Full-body inverse kinematics, walking, combat, complex mechanical transformation, and multiplayer interaction are outside the planned scope.
4.3 Evaluation
Dimension	Evaluation method
Attachment correctness	Test equipment across poses and animations; measure attachment position and orientation error and visually inspect grip alignment
Animation continuity	Compare abrupt switching with blended transitions; plot joint rotations around action changes to identify pose discontinuities
Interaction reliability	Test selection, rotation, release, cancellation, equipment changes, and XR entry/exit for unexpected jumps or lost configuration
Rendering performance	Record median and 95th-percentile frame intervals in repeated fixed-scene tests; compare model complexity and shadow settings
Optional snapping behavior	Test valid and invalid attachment distances, orientations, and socket types


Our initial desktop optimization target is approximately 60 FPS at 1920×1080 on the designated test computer.

We will establish an XR performance target after the first-week device tests, based on the actual hardware and runtime. We will distinguish browser frame timing from headset display refresh rate and report the measurement method and limitations.

The project will investigate three questions:
1. Can a shared attachment and animation system support multiple equipment configurations without recreating every animation?
2. How does pose blending improve continuity when users switch actions interactively?
3. How do model complexity and rendering settings affect performance on desktop and in XR?
5. Schedule and Responsibilities
5.1 Four-Week Schedule
Period	Tasks	Expected outcome
Preparation: Nov. 7–10	Select candidate assets, assign responsibilities, confirm device access, establish the repository, and publish the proposal	Submit the proposal PDF with a clickable website link by Nov. 10
Week 1: Nov. 11–17	Prepare assets, establish joints and sockets, load the model, and test XR entry, selection, rotation, and exit using a simple object	Demonstrate arm-and-weapon motion on desktop and a minimal working XR prototype
Week 2: Nov. 18–24	Implement color changes, weapon replacement, the first animation, and basic spatial menus; integrate an end-to-end workflow	Submit the milestone webpage, approximately one-minute video, and 2–3 slides by Nov. 22; use the remaining days for adjustments
Week 3: Nov. 25–Dec. 1	Complete all three animations, transitions, shared state, and initial performance testing	Complete the baseline; begin drag-and-snap assembly only if the core system is stable
Week 4: Dec. 2–6	Freeze core features, fix issues, run evaluations, record videos, and complete the report and presentation materials	Submit final deliverables by Dec. 6 and prepare for presentations on Dec. 7–8


5.2 Initial Division of Work
Team member	Primary responsibilities
[Member 1]	Asset preparation, material regions, joint configuration, and attachment sockets
[Member 2]	Key poses, animation evaluation, playback states, and smooth transitions
[Member 3]	WebXR integration, spatial selection, manipulation, and device testing
[Member 4]	Desktop and spatial menus, configuration synchronization, integration, and performance measurements


All members will contribute to integration, evaluation, documentation, and presentation materials. Each member will appear or speak in both the milestone and final videos and maintain an identifiable contribution history.
5.3 Risk Management
Asset suitability: We will test articulation and attachment behavior during the first week. If necessary, we will simplify the model while preserving the system’s technical goals.

XR integration: We will test on the actual device early. If a platform limitation prevents the planned experience, we will promptly discuss a scope adjustment with course staff. The desktop version will remain available for demonstration, but will not be presented as evidence that the immersive goal was completed.

Scope growth: Modular attachment, animation transitions, and basic XR interaction take priority. Optional assembly interactions and environmental decoration will be reduced first.
6. Resources and References
6.1 Hardware and Software
Resource	Intended use
Meshy or another documented asset source	Base mecha, weapon, and accessory assets
Blender	Model preparation, articulation, material organization, and export
Three.js and WebGL	Scene rendering, mathematical operations, and asset loading
WebXR	Immersive views and spatial input on Vision Pro
JavaScript/TypeScript, HTML, and CSS	Application logic and desktop interface
Git and a shared repository	Collaboration, version control, and contribution records
HTTPS-enabled static hosting	Persistent project reports and interactive demonstration


Planned hardware: Team development computers, an Apple Vision Pro, and a Mac for device debugging. We will confirm the specific computer configurations, visionOS/Safari versions, and device access arrangements before submission and document them in our evaluation.
6.2 References
- Three.js GLTFLoader Documentation — Loading glTF/GLB model assets.
- Three.js Quaternion Documentation — Rotation representation, interpolation, and angular comparison.
- Apple: Build Immersive Web Experiences with WebXR — Integrating and testing immersive web experiences.
- WebKit: Introducing Natural Input for WebXR in Apple Vision Pro — Spatial input behavior and interaction events.
- Meshy Rigging Documentation — Automatic rigging requirements and limitations, if used for asset preparation.
We plan to build the application using these libraries rather than modifying an existing complete mecha customization system. Specific model, texture, and borrowed code sources will be added once selected.
