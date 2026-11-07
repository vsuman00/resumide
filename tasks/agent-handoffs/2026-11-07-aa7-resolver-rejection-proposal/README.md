# Resolver rejection normalization

The actual 8d8 run rejected both alias/cycle inputs with zero decoder calls, but their AttributeError did not match the required UnsafePDF contract. This minimal proposal wraps only value.get_object() resolution failures as UnsafePDF with the original cause. It does not catch BaseException or change depth/cycle bounds, fixtures, assertions or the admitted format.

One affected ordinary MOCK unit uses the real pypdf IndirectObject with a fake get_object that raises AttributeError. Old 5a propagates that exact error; new 6d3 raises UnsafePDF caused by the same error object. The fake getter runs once per version. No PDF bytes, real reader, decoder, Docker or saved 49 fixture program ran. Unrelated MOCK 4 checks were not repeated.

The candidate parses as Python AST. Reversing the exact small replacement recovers baseline 5a byte-for-byte. Baseline source and failed 47/49 runtime receipts remain preserved. Root must review/integrate and rebuild before running the unchanged 49 checks after the Native 7 slot is released. This source proposal does not supply that actual runtime result or phase/security acceptance.
