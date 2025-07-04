/**
 * FNV-1a hash function implementation.
 * Fast, non-cryptographic hash function suitable for file content hashing.
 */
export function fnv1a(data: Uint8Array): string {
    let hash = 0x811c9dc5; // FNV offset basis (32-bit)
    
    for (let i = 0; i < data.length; i++) {
        hash ^= data[i];           // XOR with byte
        hash *= 0x01000193;       // Multiply by FNV prime
        hash = hash >>> 0;        // Keep as 32-bit unsigned
    }
    
    return hash.toString(16);     // Return as hex string
}
