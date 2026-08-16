# Orphan cleanup

Cleanup is marker-aware and dry-run-first.

| Artifact state | Minimum retention |
| --- | ---: |
| Failed GENERATING temporary data | 24 hours |
| Abandoned upload | 7 days |
| FAILED package | 30 days |
| ROLLED_BACK package | 30 days |
| Superseded unpublished retry-salt package | 30 days |
| PUBLISHED package or any hash with a publication marker | Indefinite |

Every candidate requires a diagnostic receipt, reference scan, publication-marker check, and dry-run report. Only unreferenced unpublished assets past retention become delete-eligible. Cleanup must recheck the marker transaction immediately before deletion.

PUBLISHED objects are never automatically deleted, overwritten, renamed, or regenerated. A failure label cannot override an existing publication marker. Large cleanup batches require an explicit operator approval and remain separate from normal controller recovery.
