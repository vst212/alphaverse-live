#!/bin/bash

YARN_PATH="/home/tintin/.nvm/versions/node/v23.1.0/bin/yarn"

echo 'Starting execution...'
cd
rm -rf proxy
mkdir proxy
cp -r ~/alphaverse-live/agent/* ~/proxy/
cd proxy/
yarn install
