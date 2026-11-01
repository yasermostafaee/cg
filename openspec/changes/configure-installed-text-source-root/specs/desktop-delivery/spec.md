# desktop-delivery — installed shared-text root

## ADDED Requirements

### Requirement: CG Bridge Setup SHALL configure the shared text folder used by CG Control

CG Bridge Setup SHALL offer an optional **Shared text folder** field backed by the native Windows
folder picker. The value SHALL be a station-specific existing local or UNC folder and SHALL be
written as `textSourceRoot` through CG Bridge's configuration schema. No product build SHALL
hardcode a customer's folder.

The setup window SHALL read an existing `textSourceRoot` during an upgrade and SHALL preserve it.
The silent installer SHALL accept the equivalent `/TEXTSOURCEROOT=` option. Omitting the option on
an upgrade SHALL keep the stored value; omitting it on a first install SHALL retain the documented
private default.

Templates SHALL continue to store only a safe relative filename. CG Control SHALL ask Bridge for
that name, and Bridge SHALL resolve it under the configured root.

#### Scenario: A station administrator chooses its shared folder

- **WHEN** CG Bridge Setup selects `\\station\news-text` as **Shared text folder**
- **THEN** `cg-bridge.json` stores that value as `textSourceRoot` and the service resolves
  `zirnevis.txt` under it

#### Scenario: Another server chooses a different folder

- **WHEN** another installation selects a different local or UNC folder
- **THEN** its own configuration stores that folder without changing the product or any template

#### Scenario: Upgrade preserves the root

- **WHEN** CG Bridge is upgraded without a new `/TEXTSOURCEROOT=` value
- **THEN** the previously configured root remains in force
