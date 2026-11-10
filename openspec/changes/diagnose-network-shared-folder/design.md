## Decision

A missing path reported by the operating system does not establish an ACL failure. A UNC missing
path tells the administrator to check reachability and share name from the Bridge server. An
explicit permission denial directs them to the permissions that apply to the Bridge service
identity. A real directory read checks that identity's access. A failed check leaves both the
active and persisted folder alone.

The Save path action routes its refusal through Station setup's existing section message. The
button keeps its error state, and a long message has no place in the input-and-button grid.

On the customer station the Bridge and Playout Engine are on server A, and the Playout client,
Designer and CG Control are on server B. Opening the share on B does not show whether the Bridge
service on A can access it. Check the UNC share from A under that service's identity.
