# EasyPanel template

This directory contains an EasyPanel template for Construction OS. It follows the
format used by the official EasyPanel templates repository:

- `meta.yaml` describes the template metadata and input schema.
- `index.ts` generates the EasyPanel services.

The template deploys two services:

- Construction OS, exposed on port `8502`.
- SurrealDB v2, kept private on the project network and persisted in a volume.

## Testing

1. Copy this directory to `templates/construction-os` in
   `easypanel-io/templates`.
2. Run the EasyPanel templates playground with `npm run dev`.
3. Create the template from the generated JSON inside an EasyPanel instance.

Set a Construction OS password in the form before deploying. If it is left blank,
the template generates one and stores it in the app service environment as
`CONSTRUCTION_OS_PASSWORD`.

After deployment, open the EasyPanel domain and configure AI providers from
Construction OS's Settings > API Keys page.
