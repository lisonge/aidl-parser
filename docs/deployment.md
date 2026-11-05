# Website deployment

[Website workflow](../.github/workflows/website.yml) builds the parser and website, then deploys `aidl-website/dist` to the Cloudflare Pages project `aidl-parser` at <https://aidl-parser.pages.dev/>. It runs manually or when relevant files change on `main`.

Create the Cloudflare Pages project `aidl-parser` and configure the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` before running the workflow. The API token needs permission to deploy to that account's Cloudflare Pages project. The workflow installs the pinned mise toolchain and downloads pinned upstream sources before building.

Local build commands do not publish npm packages or deploy the website.

## Package releases

The [release workflow](../.github/workflows/release.yml) runs when a `v*` tag is pushed. It checks that the tag matches `aidl-parser/package.json` and that [CHANGELOG.md](../aidl-parser/CHANGELOG.md) is nonempty, then builds, verifies and publishes the npm package. After npm publication succeeds, it creates a GitHub Release for the same tag using the manually maintained `aidl-parser/CHANGELOG.md` directly as the release notes. This file contains only the current version's changes, without a version heading or previous release records.

To release a new version, update the package version and replace the changelog contents with the current changes, commit the changes, then push the matching tag (for example, `v0.1.0`). GitHub Release creation uses the workflow's `GITHUB_TOKEN`; no additional release token is required.
