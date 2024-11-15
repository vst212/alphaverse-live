#!/bin/bash -l

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v23.1.0

command -v nvm
nvm --version
which yarn
echo $PATH

YARN_PATH="/home/tintin/.nvm/versions/node/v23.1.0/bin/yarn"  # Full path, no tilde

echo 'Starting execution...'
cd
rm -rf proxy
mkdir proxy
cp -r ~/alphaverse-live/agent/* ~/proxy/ # Tilde is OK here because it's a direct shell command
cd proxy/
$YARN_PATH install
