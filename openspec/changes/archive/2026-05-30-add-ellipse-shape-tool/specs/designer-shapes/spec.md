## ADDED Requirements

### Requirement: Add an ellipse shape from the tool rail

The Designer SHALL provide an Ellipse tool that, when active, creates an
ellipse shape element on the canvas at the click point. The created element
MUST be a valid `ShapeElement` with `shape: "ellipse"` and a default size
that reads as a circle (equal width and height), which the operator can then
resize into any ellipse.

#### Scenario: Operator adds an ellipse

- **WHEN** the operator selects the Ellipse tool and clicks an empty area of the canvas
- **THEN** a new ellipse shape element is added to the scene at that point, becomes the selection, and renders as a filled ellipse in the preview

#### Scenario: Default ellipse is a circle

- **WHEN** an ellipse is created without further edits
- **THEN** its transform width equals its height (a circle) so the operator starts from a symmetric shape

### Requirement: Add a rectangle shape from the tool rail

The Designer SHALL provide a Rectangle tool that creates a rectangular
`ShapeElement` (`shape: "rect"`) on the canvas at the click point.

#### Scenario: Operator adds a rectangle

- **WHEN** the operator selects the Rectangle tool and clicks an empty area of the canvas
- **THEN** a new rectangle shape element is added at that point and becomes the selection

### Requirement: Move and resize shapes

Shape elements (rectangle and ellipse) SHALL be movable and resizable through
the same selection gizmo as every other element; no shape-specific transform
logic is required.

#### Scenario: Operator moves and resizes a shape

- **WHEN** a shape is selected and the operator drags its body or a resize handle
- **THEN** the shape's transform position/size update and the preview reflects the new geometry

### Requirement: Change a shape's kind

The Inspector SHALL let the operator switch a selected shape's kind between
`rect`, `rounded-rect`, and `ellipse` without recreating the element.

#### Scenario: Operator converts a rectangle to an ellipse

- **WHEN** a rectangle shape is selected and the operator picks "ellipse" in the Inspector's shape control
- **THEN** the same element's `shape` becomes `ellipse` and it renders as an ellipse in the preview
