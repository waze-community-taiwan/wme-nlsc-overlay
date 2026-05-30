# Requirements Document

## Introduction

The Floating Layer Box is an in-page overlay control for the WME NLSC Overlay userscript. It lets editors put a single visible NLSC layer on top of the WME editor objects (roads, places, hazards) with one click, without opening the NLSC Overlay sidebar tab. The box floats over the whole Waze map editor page (including the search bar, save, and cancel buttons), is partially transparent, and can be dragged anywhere.

The feature reuses the existing layer machinery rather than introducing a parallel system:
- `NlscController` remains the single source of truth for layer state. "Put on top" maps to the existing radio-style "above WME objects" feature via `setAbove(code, true)` — at most one layer holds the above slot at a time (persisted in `state.aboveCode`).
- "Enabled layers" are the layers where `state.visible[code]` is `true`.
- The box's enable flag, opacity, and last drag position are persisted by extending `NlscState` and reusing `loadState`/`saveState` (localStorage key `wme-nlsc-overlay:state`).
- The on/off toggle and opacity slider live in the existing settings panel rendered by `renderSidebar()`.

## Glossary

- **Floating_Layer_Box**: The draggable, partially transparent in-page overlay element that lists enabled NLSC layers and provides a per-layer control to put a layer on top of WME editor objects.
- **NLSC_Controller**: The existing `NlscController` (src/controller.ts), the single source of truth for layer visibility, opacity, color, above-state, and order, exposing `setVisible`, `setOpacity`, `setAbove`, `getOrder`, `setOrder`, and the `onVisibleChange`, `onAboveChange`, `onOrderChange` subscriptions.
- **Settings_Panel**: The NLSC Overlay script tab UI rendered by `renderSidebar()` (src/sidebar.ts) inside the WME sidebar, registered via `sdk.Sidebar.registerScriptTab()`.
- **NLSC_State**: The persisted preferences object (`NlscState` in src/state.ts) stored in localStorage under key `wme-nlsc-overlay:state` via `loadState`/`saveState`.
- **Enabled_Layer**: An NLSC layer whose `state.visible[code]` is `true` (toggled on / visible).
- **Above_Slot**: The single-layer "above WME objects" slot held by `state.aboveCode`; `null` means no layer is pinned above the editor band.
- **On_Top_Control**: The per-layer button inside the Floating_Layer_Box that pins its layer to the Above_Slot (or releases it), backed by `NLSC_Controller.setAbove`.
- **Box_Enabled_Setting**: The persisted boolean that controls whether the Floating_Layer_Box is shown; defaults to `true`.
- **Box_Opacity_Setting**: The persisted numeric opacity (0.0–1.0) applied to the Floating_Layer_Box.
- **Box_Position**: The persisted last on-screen position (x/y coordinates) of the Floating_Layer_Box.
- **Layer_Name**: The human-readable display name of a layer (`NlscLayer.name` / `title` from src/layers.ts).

## Requirements

### Requirement 1: Render the Floating Layer Box on the page

**User Story:** As a WME editor, I want a floating box on the map editor page, so that I can control which layer is on top without opening the sidebar panel.

#### Acceptance Criteria

1. WHILE the Box_Enabled_Setting is `true`, THE Floating_Layer_Box SHALL be rendered as exactly one `position: fixed` element layered above the WME page content.
2. WHILE the Box_Enabled_Setting is `false`, THE Floating_Layer_Box SHALL NOT be present in the page DOM.
3. WHILE the Floating_Layer_Box is rendered, THE Floating_Layer_Box SHALL remain fully visible and clickable wherever it overlaps the map, the search bar, the save button, or the cancel button.
4. WHEN the userscript finishes initialization, IF the Box_Enabled_Setting is `true`, THEN THE Floating_Layer_Box SHALL be displayed within 1 second without requiring the user to open the Settings_Panel.
5. IF the WME page content required to attach the Floating_Layer_Box is not yet available at initialization, THEN THE Floating_Layer_Box SHALL retry attachment at intervals no longer than 1 second for up to 30 seconds until the page content becomes available.

### Requirement 2: List enabled layers with a per-layer on-top control

**User Story:** As a WME editor, I want the floating box to list my visible layers with a button to raise each one, so that I can switch which layer covers the road objects in one click.

#### Acceptance Criteria

1. THE Floating_Layer_Box SHALL display one row for each Enabled_Layer, showing the layer's Layer_Name, with rows ordered according to the order returned by `NLSC_Controller.getOrder`.
2. WHERE a layer is not an Enabled_Layer, THE Floating_Layer_Box SHALL exclude that layer from the displayed list.
3. THE Floating_Layer_Box SHALL render one On_Top_Control next to each listed Enabled_Layer.
4. WHEN the user activates the On_Top_Control for a layer that does not currently hold the Above_Slot, where activation is a pointer click or keyboard activation, THE NLSC_Controller SHALL pin that layer to the Above_Slot via `setAbove(code, true)`.
5. WHEN the user activates the On_Top_Control for the layer that currently holds the Above_Slot, where activation is a pointer click or keyboard activation, THE NLSC_Controller SHALL release the Above_Slot via `setAbove(code, false)`.
6. WHILE a layer holds the Above_Slot, THE Floating_Layer_Box SHALL render that layer's On_Top_Control so that it differs from every inactive On_Top_Control by at least one observable visual attribute.
7. WHEN one layer is pinned to the Above_Slot, THE Floating_Layer_Box SHALL render every other listed layer's On_Top_Control in the inactive state, reflecting that at most one layer holds the Above_Slot.
8. WHEN the user activates an On_Top_Control, THE Floating_Layer_Box SHALL re-render the active/inactive state of its On_Top_Controls within 200ms.
9. IF no Enabled_Layer exists, THEN THE Floating_Layer_Box SHALL replace the row list with a message indicating that no layers are currently visible.
10. IF an On_Top_Control activation targets a layer that is not an Enabled_Layer present in the displayed list, THEN THE Floating_Layer_Box SHALL leave the Above_Slot unchanged and the displayed list unmodified.

### Requirement 3: Drag the box anywhere on the page

**User Story:** As a WME editor, I want to move the floating box anywhere on the page, so that it does not block the map area or controls I need.

#### Acceptance Criteria

1. WHEN the user presses the pointer on the drag handle and moves the pointer, THE Floating_Layer_Box SHALL update its position on each pointer-move event so that the offset between the pointer location and the box's top-left corner stays equal to the offset captured at the moment the drag handle was first pressed.
2. THE Floating_Layer_Box SHALL be positionable over any region of the page viewport, including the map area, the search bar, the save button, and the cancel button, while constraining its position so that the entire drag handle remains within the viewport bounds.
3. WHILE a drag operation is in progress, THE Floating_Layer_Box SHALL apply `user-select: none` to its drag handle so that no page text is selected during the drag.
4. WHEN the user releases the pointer to end a drag operation, THE Floating_Layer_Box SHALL retain the top-left position at which the pointer was released until a subsequent drag operation moves it.
5. IF the user presses the pointer on the Floating_Layer_Box outside its drag handle, THEN THE Floating_Layer_Box SHALL NOT begin a drag operation and SHALL keep its current position unchanged.

### Requirement 4: Partial transparency

**User Story:** As a WME editor, I want the floating box to be partially transparent, so that I can still see the map underneath it.

#### Acceptance Criteria

1. THE Floating_Layer_Box SHALL render with the opacity defined by the Box_Opacity_Setting when that value is within the inclusive range 0.1 to 1.0.
2. IF the Box_Opacity_Setting is below 0.1, THEN THE Floating_Layer_Box SHALL render at opacity 0.1.
3. IF the Box_Opacity_Setting is above 1.0, THEN THE Floating_Layer_Box SHALL render at opacity 1.0.
4. IF the Box_Opacity_Setting is missing or not a number, THEN THE Floating_Layer_Box SHALL render at the default opacity, which is within the inclusive range 0.1 to 1.0.
5. WHEN the Box_Opacity_Setting changes, THE Floating_Layer_Box SHALL update its rendered opacity to the new value clamped to the inclusive range 0.1 to 1.0 within 200 milliseconds.
6. THE Floating_Layer_Box SHALL never render at an opacity below 0.1.

### Requirement 5: Enable/disable from the settings panel

**User Story:** As a WME editor, I want to turn the floating box on or off from the NLSC Overlay settings panel, so that I can hide it when I do not need it.

#### Acceptance Criteria

1. WHEN the Settings_Panel is rendered, THE Settings_Panel SHALL display a binary enable control whose state matches the current Box_Enabled_Setting value (set to on when `true`, set to off when `false`).
2. THE Box_Enabled_Setting SHALL default to `true` on a fresh installation where no persisted value exists.
3. WHEN the user changes the Settings_Panel enable control, THE Settings_Panel SHALL update the Box_Enabled_Setting to the selected on/off value.
4. WHEN the user sets the Settings_Panel enable control to off, THE Floating_Layer_Box SHALL be removed from the page within 200ms so that no floating element is shown.
5. WHEN the user sets the Settings_Panel enable control to on, THE Floating_Layer_Box SHALL be displayed on the page within 200ms using the persisted Box_Opacity_Setting and Box_Position.

### Requirement 6: Adjust opacity from the settings panel

**User Story:** As a WME editor, I want to adjust the floating box opacity in the settings panel, so that I can balance readability against seeing the map underneath.

#### Acceptance Criteria

1. THE Settings_Panel SHALL display an opacity control whose selectable range is the inclusive range 0.1 to 1.0 in increments no larger than 0.05, with its displayed position reflecting the current Box_Opacity_Setting.
2. WHEN the user changes the Settings_Panel opacity control to a value within the inclusive range 0.1 to 1.0, THE Settings_Panel SHALL set the Box_Opacity_Setting to that selected value.
3. IF the user selects an opacity value below 0.1 through the Settings_Panel opacity control, THEN THE Settings_Panel SHALL set the stored Box_Opacity_Setting to 0.1.
4. IF the user selects an opacity value above 1.0 through the Settings_Panel opacity control, THEN THE Settings_Panel SHALL set the stored Box_Opacity_Setting to 1.0.

### Requirement 7: Persist settings across reloads

**User Story:** As a WME editor, I want my floating box preferences to persist, so that I do not have to reconfigure them every time I reload the editor.

#### Acceptance Criteria

1. WHEN the Box_Enabled_Setting changes, THE NLSC_State SHALL persist the new value to localStorage via `saveState` within 500ms.
2. WHEN the Box_Opacity_Setting changes, THE NLSC_State SHALL persist the new value to localStorage via `saveState` within 500ms.
3. WHEN a drag operation completes, THE NLSC_State SHALL persist the resulting Box_Position to localStorage via `saveState` within 500ms.
4. WHEN the userscript loads, THE Floating_Layer_Box SHALL apply the persisted Box_Enabled_Setting, Box_Opacity_Setting, and Box_Position from `loadState`.
5. IF any part of the box at the persisted Box_Position would fall outside the current viewport bounds, THEN THE Floating_Layer_Box SHALL render with its entire area within the visible viewport.
6. IF the NLSC_State contains no persisted Floating_Layer_Box settings, or contains invalid values for them, THEN THE Floating_Layer_Box SHALL apply default values of enabled `true`, opacity `0.9`, and a default position with its entire area within the viewport.
7. IF persisting Floating_Layer_Box settings via `saveState` fails, THEN THE NLSC_State SHALL retain the in-memory values and the Floating_Layer_Box SHALL continue operating without interrupting the user.

### Requirement 8: Stay in sync with layer state changes

**User Story:** As a WME editor, I want the floating box to reflect layer changes I make elsewhere, so that the box always shows accurate information.

#### Acceptance Criteria

1. WHEN a layer becomes visible through any UI surface, THE Floating_Layer_Box SHALL add a row for that layer to its list via the `NLSC_Controller.onVisibleChange` subscription within 200ms.
2. WHEN a layer becomes hidden through any UI surface, THE Floating_Layer_Box SHALL remove that layer's row from its list via the `NLSC_Controller.onVisibleChange` subscription within 200ms.
3. WHEN the Above_Slot changes through the Settings_Panel, THE Floating_Layer_Box SHALL, within 200ms via the `NLSC_Controller.onAboveChange` subscription, render the On_Top_Control of the layer holding the Above_Slot in the active state and every other listed On_Top_Control in the inactive state.
4. WHILE the Settings_Panel is displayed, WHEN the user activates an On_Top_Control in the Floating_Layer_Box, THE Settings_Panel SHALL render the layer holding the resulting Above_Slot as its above-pinned layer (or render no layer as pinned when the Above_Slot is released) via the shared `NLSC_Controller.onAboveChange` subscription within 200ms.
5. IF the layer holding the Above_Slot becomes hidden, THEN THE Floating_Layer_Box SHALL remove that layer's row within 200ms while the persisted Above_Slot value in NLSC_State is retained rather than cleared.
6. WHEN a previously hidden layer whose code matches the retained Above_Slot value becomes visible again, THE Floating_Layer_Box SHALL add that layer's row and render its On_Top_Control in the active state via the `NLSC_Controller.onVisibleChange` subscription within 200ms.
