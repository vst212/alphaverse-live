#!/bin/bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v23.1.0  # Or your specific Node.js version

YARN_PATH="/home/tintin/.nvm/versions/node/v23.1.0/bin/yarn"

echo 'Starting execution...'
cd
rm -rf proxy
mkdir proxy
cp -r ~/alphaverse-live/agent/* ~/proxy/
cd proxy/
$YARN_PATH install
