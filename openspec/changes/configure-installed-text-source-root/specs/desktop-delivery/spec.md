# desktop-delivery — installed shared-text root

## ADDED Requirements

### Requirement: CG Bridge Setup SHALL configure the shared files folder used by CG Control

CG Bridge Setup SHALL offer an optional **Shared files folder** field backed by the native Windows
folder picker. The value SHALL be a station-specific existing local or UNC folder and SHALL be
written as `textSourceRoot` through CG Bridge's configuration schema. No product build SHALL
hardcode a customer's folder.

The setup window SHALL read an existing `textSourceRoot` during an upgrade and SHALL preserve it.
The silent installer SHALL accept the equivalent `/TEXTSOURCEROOT=` option. Omitting the option on
an upgrade SHALL keep the stored value; omitting it on a first install SHALL retain the documented
private default.

For a configured local folder, Setup SHALL grant `NT SERVICE\CGBridge` inherited read/execute access
to the root and its current and future children without granting write, modify, or full control and
without replacing unrelated ACL entries. Setup SHALL apply this from the effective stored
configuration on both first install and upgrade/repair.

For a direct remote UNC root, Setup SHALL NOT claim that administrator reachability proves service
reachability and SHALL NOT hardcode or silently rewrite the path. It SHALL give an actionable warning
that the Bridge server's computer account needs Read access in both the remote share and NTFS ACL.

Templates SHALL continue to store only a safe relative filename. CG Control SHALL ask Bridge for
that name, and Bridge SHALL resolve it under the configured root.

CG Control Station setup SHALL show the effective path as interpreted on the CG Bridge server and
SHALL let a `station-admin` replace it. The server SHALL validate that it can read the proposed
directory before changing the live value or installed config; a refusal SHALL preserve the previous
value. The console SHALL NOT use its own native folder picker for this remote-server setting.

#### Scenario: A station administrator chooses its shared folder

- **WHEN** CG Bridge Setup selects `\\station\news-text` as **Shared files folder**
- **THEN** `cg-bridge.json` stores that value as `textSourceRoot` and the service resolves
  `zirnevis.txt` under it

#### Scenario: Another server chooses a different folder

- **WHEN** another installation selects a different local or UNC folder
- **THEN** its own configuration stores that folder without changing the product or any template

#### Scenario: Upgrade preserves the root

- **WHEN** CG Bridge is upgraded without a new `/TEXTSOURCEROOT=` value
- **THEN** the previously configured root remains in force

#### Scenario: Local root is readable by the installed service

- **WHEN** Setup configures an existing local folder as `textSourceRoot`
- **THEN** `NT SERVICE\CGBridge` receives inherited read/execute access to that folder and its
  children, while producer permissions remain intact

#### Scenario: Upgrade repairs a removed local read grant

- **WHEN** the configured local root remains stored but its CG Bridge service grant was removed
- **AND WHEN** CG Bridge is upgraded without `/TEXTSOURCEROOT=`
- **THEN** Setup restores inherited read/execute access from the preserved configuration

#### Scenario: Direct remote UNC needs remote administration

- **WHEN** the configured root begins with `\\`
- **THEN** Setup preserves it and warns that the Bridge server's computer account requires Read in
  both Sharing and Security (NTFS) on the remote server

#### Scenario: CG Control changes the effective Bridge-server path

- **WHEN** a station admin saves an existing readable local or UNC path from Station setup
- **THEN** CG Bridge adopts and persists that exact station-specific path

#### Scenario: CG Control proposes an unreadable path

- **WHEN** the Bridge service identity cannot read the proposed folder
- **THEN** the route refuses it with an actionable message and the previous live and stored paths
  remain unchanged
