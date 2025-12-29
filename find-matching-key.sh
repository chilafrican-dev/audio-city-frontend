#!/bin/bash

# Find private key matching the public key
PUBLIC_KEY="AAAAC3NzaC1lZDI1NTE5AAAAINf+lrHy+LXSnqO9ZaYaNEhG4D/buGYHsvwn3SJ9RHFY"

echo "Searching for matching private key..."
echo ""

for key_file in ~/.ssh/id_*; do
    if [ -f "$key_file" ] && [ ! -f "${key_file}.pub" ]; then
        # Try to extract public key from private key
        pub_from_priv=$(ssh-keygen -y -f "$key_file" 2>/dev/null | cut -d' ' -f2)
        if [ "$pub_from_priv" = "$PUBLIC_KEY" ]; then
            echo "✅ FOUND MATCHING KEY: $key_file"
            echo ""
            echo "To use it:"
            echo "  ssh -i $key_file root@168.119.241.59"
            exit 0
        fi
    fi
done

echo "❌ No matching private key found in ~/.ssh/"
echo ""
echo "The public key you provided is already on the server."
echo "You need the matching PRIVATE key to connect."
echo ""
echo "Options:"
echo "1. Check if you have the private key saved elsewhere"
echo "2. Contact VMSocket to add a new SSH key"
echo "3. Use the new key I generated: ~/.ssh/id_ed25519_audio_city.pub"
