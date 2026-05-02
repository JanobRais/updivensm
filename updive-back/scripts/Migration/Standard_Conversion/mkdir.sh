#!/usr/bin/env bash
# Observium to UpdiveNSM conversion

####################### SCRIPT DESCRIPTION ########################
# A simple script to create needed directories on UpdiveNSM server #
###################################################################

########################### DIRECTIONS ############################
# Enter values for NODELIST, L_RRDPATH. The default should work if# 
# you put the files in the same location.                         #
###################################################################

############################# CREDITS #############################             
# UpdiveNSM work is done by a great group - https://www.UpdiveNSM.org    #
# Script Written by - Dan Brown - http://vlan50.com               #
###################################################################

# Enter path to node list text file
NODELIST=/tmp/nodelist.txt
# Enter path to UpdiveNSM RRD directories
L_RRDPATH=/opt/UpdiveNSM/rrd/

# This loop enters the RRD folder and creates dir based on contents of node list text file
while read line 
	do mkdir -p $L_RRDPATH"${line%/*}"
done < $NODELIST
