# Daybreak local data

Daybreak v1 is local-only. It does not create an account, sync commitments to a
server, or send telemetry.

## Stored files

The desktop app stores commitment state in Electron's app user-data directory.
On Windows installs, that is normally:

```text
%APPDATA%\Daybreak\daybreak.json
```

Daybreak also maintains a same-folder backup file:

```text
%APPDATA%\Daybreak\daybreak.json.bak
```

During a write, Daybreak may briefly create `daybreak.json.tmp` in that same
folder. The temporary file is not a backup.

## Back up data

To make a local backup, copy `daybreak.json` and `daybreak.json.bak` to a folder
you control before uninstalling, wiping Windows, or moving to another PC.

## Delete data

To remove Daybreak's local commitment data:

1. Finish or clear any active Daybreak ritual so the app can close.
2. Quit Daybreak.
3. Open `%APPDATA%\Daybreak`.
4. Delete `daybreak.json` and `daybreak.json.bak`.

The next Daybreak launch starts from an empty local store. Uninstalling the app
does not prove these user-data files were removed, so delete the files directly
when you want the commitment history gone.

For support, email founder@daybreak.rest.
