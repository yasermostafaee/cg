# CG Control forms

Use `TextInput`, `NumericInput`, `SelectInput` and `ComboField` for editable values. They share `.cg-field` for the background, text, border, focus, invalid and disabled states. For a colour setting, use `ColorInput appearance="swatch"`. For a numeric field whose wrapper already draws the control, use `appearance="bare"`.

| Pattern                                                              | Class                                       |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Compact form                                                         | `cg-form` on the container                  |
| Wrapping row of fields and actions                                   | `cg-form cg-form-toolbar`                   |
| Label above its control                                              | `cg-form-field` on a label or field wrapper |
| Label beside its control                                             | `cg-form-field cg-form-field--inline`       |
| Repeated inline fields with shared label, control and action columns | `cg-form-rows` with `cg-form-row` children  |
| Field columns that wrap to fit the available width                   | `cg-form-grid`                              |

Inside an aligned row, use `cg-form-row__label`, `cg-form-row__control` and, when shown, `cg-form-row__action`. Any notes or secondary commands go in `cg-form-row__details`. The group reserves the action column only when a row needs it.

Keep the base control skin in `controls.css`, form geometry and accessibility states in `forms.css`, and token values in `theme.ts`. Feature CSS can define placement, column proportions and widths specific to its content. Associate visible labels with their inputs and keep inline controls in reading order when they wrap.

The Layers table and the PVW/PGM controls retain their own compact geometry. Station Setup keeps its existing taller field spacing with the shared field colours.

Modal bodies inherit the shared field border, placeholder and focus treatment. Use `ModalAction` for footer intent and `variant="primary"` for the main action inside a form. Use `variant="danger"` for inline removal actions and the destructive role for confirmation footers. The modal size controls spacing and geometry. Button variants control action colours.

## Form colours and value tooltips

The APASAI MAM dark palette comes from `design/tokens/theme.dark.tokens.json` in MAM. The
CG mapping in `theme.ts` supplies the dialog surfaces, field boundary, interactive cyan, and
neutral control states. `forms.css` applies the control palette to dialogs and the Inspector.
Settings switches and checkboxes share the form primary token. CG's broadcast state tokens
and form measurements come from its own theme.

The shared `Tooltip` reads clipped text controls, textareas and selected option labels. For a
rich `ComboField`, pass its complete display text as `valueTooltip` and mark any inner
clipping boxes with `data-field-overflow`. Keep passwords and raw source identifiers out of
value tooltips.
