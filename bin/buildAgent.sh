#!/bin/bash -l

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Ensure Node.js v23.1.0 is installed and used
nvm install v23.1.0  # Or nvm use v23.1.0 if it's already installed
nvm use v23.1.0

# Debugging lines (keep these for now)
command -v nvm
nvm --version
which yarn
echo $PATH

# No need to set YARN_PATH manually anymore. Use nvm exec:
echo 'Starting execution...'
cd /home/tintin
rm -rf proxy
mkdir proxy
cp -r ~/alphaverse-live/agent/* ~/proxy/
cd proxy/
nvm exec v23.1.0 yarn install # Or nvm exec <version> yarn install if using a different version
