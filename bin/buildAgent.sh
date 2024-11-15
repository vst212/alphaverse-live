#!/bin/bash -l  # Login shell for proper nvm initialization

export NVM_DIR="$HOME/.nvm"  # Use $HOME here, it's more reliable
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v23.1.0

# Debugging lines (keep these for now)
command -v nvm
nvm --version
which yarn
echo $PATH

YARN_PATH="/home/tintin/.nvm/versions/node/v23.1.0/bin/yarn"  # Absolute path, NO TILDE

echo 'Starting execution...'
cd /home/tintin # Ensure you're in the correct home directory
rm -rf proxy
mkdir proxy
cp -r ~/alphaverse-live/agent/* ~/proxy/ # Tilde is OK *here* because it's a direct shell command
cd proxy/
$YARN_PATH install
