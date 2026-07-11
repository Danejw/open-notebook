# Sources Components

The `AddSourceDialog` component provides a comprehensive interface for adding new sources to projects with async processing support.

## Features

- **Multi-step wizard**: Source type → Projects → Processing options
- **Multi-project selection**: Add sources to multiple projects simultaneously  
- **Artifacts**: Apply artifacts during source processing
- **Batch upload**: Support for multiple URLs or files at once
- **Async processing**: Non-blocking source ingestion with status polling

## Usage

### Basic Usage

```tsx
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'

<AddSourceDialog open={open} onOpenChange={setOpen} />
```

### With Default Project

```tsx
<AddSourceDialog
  open={open}
  onOpenChange={setOpen}
  defaultprojectId="project:123"
/>
```

### Via Create Dialogs Provider

```tsx
const { openSourceDialog } = useCreateDialogs()
// Opens dialog from anywhere in the app
openSourceDialog()
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | - | Dialog open state |
| `onOpenChange` | `(open: boolean) => void` | - | Open state callback |
| `defaultprojectId` | `string` | - | Pre-select a project |

## Related Hooks

- `useProjects()` - Fetches available projects
- `useArtifacts()` - Fetches available artifacts
- `useCreateSource()` - Submits source creation
