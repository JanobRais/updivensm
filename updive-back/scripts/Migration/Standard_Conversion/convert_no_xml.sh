#!/usr/bin/env bash
# Observium to UpdiveNSM conversion

####################### SCRIPT DESCRIPTION ########################
# First we SSH to UpdiveNSM and create necessary directories with  #
# the mkdir script. Then the script enters each Observium RRD dir #
# and SCPs the RRD files to the correct directory on UpdiveNSM.    #
# After that we add all of the devices to UpdiveNSM using the      #
# destwork script.                                                #
###################################################################

########################### DIRECTIONS ############################
# Run as Root from the Observium server                           #
#                                                                 #
# Enter values for DEST, L_RRDPATH, O_RRDPATH, MKDIR, DESTSCRIPT, #
# and NODELIST. The defaults should work if you put the files in  #
# the same location.                                              #
###################################################################

############################# CREDITS #############################             
# UpdiveNSM work is done by a great group - https://www.UpdiveNSM.org    #
# Script Written by - Dan Brown - http://vlan50.com               #
###################################################################


# Enter UpdiveNSM IP or hostname here
DEST=10.0.253.35
# Enter UpdiveNSM RRD path here
L_RRDPATH=/opt/UpdiveNSM/rrd/
# Enter Observium RRD path here
O_RRDPATH=/opt/observium/rrd/
# Enter path to mkdir script here
MKDIR=/tmp/mkdir.sh
# Enter path to destwork script here
DESTSCRIPT=/tmp/destwork.sh
# Enter path to nodelist text file
NODELIST=/tmp/nodelist.txt

# This line SSHs to UpdiveNSM server and makes directories based on node list text file
ssh root@$DEST 'bash -s' < $MKDIR

# Conversion and transfer loop 
while read line; 
	# Enter RRD Directory
	do cd $O_RRDPATH"${line%/*}" 
		# Transfer RRD files to UpdiveNSM Server
		scp *.rrd root@$DEST:$L_RRDPATH"${line%/*}"/ 
		# Exit to parent dir
		cd ..
	done < $NODELIST

# This line SSHs to UpdiveNSM server and runs the destwork script to finish conversion
ssh root@$DEST 'bash -s' < $DESTSCRIPT
