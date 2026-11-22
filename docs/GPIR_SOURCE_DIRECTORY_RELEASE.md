# Global Central Banks release

The public homepage requests a names-only preview, rounded up per region and source type. Full cards are served by the Edge Function after Supabase verifies the reader and the existing production subscription resolver allows access. The named QA account is scoped to this directory and must be configured by its verified Supabase user UUID.

## Owner release steps

1. Apply migration `20261122041500_source_directory` through the approved Supabase release process.
2. Generate the data with `python scripts/build-source-directory-seed.py <approved-v4-matrix.docx> <iso_3166-1.json>` using python-docx and ISO Codes data. Review the regional counts and source URLs, then apply the generated SQL privately. The generated rows belong in Supabase, where browser roles have no direct permissions.
3. Set the Edge Function environment value `GPIR_SOURCE_DIRECTORY_QA_READER_ID` to the verified user UUID for the owner-designated test reader. Deploy only `gpir-source-directory` with `--no-verify-jwt` so guests can retrieve the preview. Full access is verified by the function against Supabase Auth and the existing subscription resolver. This flag applies only to the directory function.
4. Verify that an anonymous request and a signed-in unpaid reader receive names only, and that signed-in paid and designated QA readers receive full cards. Verify all region filters, homepage navigation, the official links, and sign-in return routing.
5. After required checks and owner merge, verify the GitHub Pages deployment and repeat the public and signed-in checks on fintechoisis.com.

Reverting the website commit removes the homepage preview and menu entry. Remove the directory-specific QA setting to revoke the exception. Keep the reviewed directory data for recovery.
