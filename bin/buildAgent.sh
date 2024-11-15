#!/bin/bash -l

# OR, if -l is still problematic:
# #!/bin/bash
# if [ -f /etc/profile ]; then . /etc/profile; fi
# if [ -f ~/.bash_profile ]; then . ~/.bash_profile; elif [ -f ~/.bash_login ]; then . ~/.bash_login; elif [ -f ~/.profile ]; then . ~/.profile; fi


export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v23.1.0

# Debugging lines (keep these for now)
command -v nvm
nvm --version
which yarn
echo $PATH

YARN_PATH="/home/tintin/.nvm/versions/node/v23.1.0/bin/yarn"  # Absolute path, NO TILDE

echo 'Starting execution...'
cd /home/tintin
rm -rf proxy
mkdir proxy
cp -r ~/alphaverse-live/agent/* ~/proxy/
cd proxy/
$YARN_PATH install
