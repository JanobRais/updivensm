#!/usr/bin/env bash
# Observium to UpdiveNSM conversion

####################### SCRIPT DESCRIPTION ########################
# This script converts the XML files from Observium back to RRD   #
# files for use with UpdiveNSM. It then adds the device using the  #
# Addhost function of UpdiveNSM                                    #
###################################################################

########################### DIRECTIONS ############################
# Enter values for L_RRDPATH, ADDHOST, SNMPSTRING, and NODELIST.  #
#The default should work if you put the files in the same location#
###################################################################

############################# CREDITS #############################
# UpdiveNSM work is done by a great group - https://www.UpdiveNSM.org    #
# Script Written by - Dan Brown - http://vlan50.com               #
###################################################################

# Enter path to UpdiveNSM RRD directories
L_RRDPATH=/opt/UpdiveNSM/rrd/
# Enter your unique SNMP String
SNMPSTRING=cisconetwork
# Enter SNMP version of all clients in nodelist text file
SNMPVERSION=v2c
# Enter path to nodelist text file
NODELIST=/tmp/nodelist.txt
# Enter user and group of UpdiveNSM installation
L_USRGRP=UpdiveNSM

# Loop enters RRD directory and then each folder based on contents of node list text file
while read -r line
	# Enter the directory
	do cd $L_RRDPATH"${line%/*}" || return 1
		# Convert from XML back to RRD
		for f in *.xml; do rrdtool restore "${f}" "$(echo "${f}" | cut -f1 -d .)".rrd; done;
		# Remove leftover XML files
		rm ./*.xml;
		# Change ownership to UpdiveNSM user and group
		chown -R $L_USRGRP:$L_USRGRP .;
		# Add the host to UpdiveNSM
		lnms device:add --$SNMPVERSION -c$SNMPSTRING "${line%/*}"
		# Change back to parent directory
		cd ..;
	done < $NODELIST
