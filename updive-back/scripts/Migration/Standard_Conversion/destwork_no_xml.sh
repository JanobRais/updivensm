#!/usr/bin/env bash
# Observium to UpdiveNSM conversion

####################### SCRIPT DESCRIPTION ########################
# A simple script to add each host in text file to UpdiveNSM       #
###################################################################

########################### DIRECTIONS ############################
# Enter values for ADDHOST, SNMPSTRING, and NODELIST. The default #
# should work if you put the files in the same location.          #
###################################################################

############################# CREDITS #############################
# UpdiveNSM work is done by a great group - https://www.UpdiveNSM.org    #
# Script Written by - Dan Brown - http://vlan50.com               #
###################################################################

# Enter your unique SNMP String
SNMPSTRING=cisconetwork
# Enter SNMP version of all clients in nodelist text file
SNMPVERSION=v2c
# Enter path to nodelist text file
NODELIST=/tmp/nodelist.txt
# Enter user and group of UpdiveNSM installation
L_USRGRP=UpdiveNSM

while read -r line
	# Change ownership to UpdiveNSM user and group
	chown -R $L_USRGRP:$L_USRGRP .;
	# Add each host from the node list file to UpdiveNSM
	do lnms device:add --$SNMPVERSION -c$SNMPSTRING "${line%/*}"
done < $NODELIST
