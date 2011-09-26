<?php

include "db.php";

$externalIP=$_SERVER['REMOTE_ADDR'];

$sql=mysql_query("SELECT internalIP,port FROM servers WHERE externalIP='$externalIP'");

if(mysql_num_rows($sql)==0){echo "0"; exit();}

$row=mysql_fetch_array($sql);

echo $row[internalIP] . "," . $row[port];

?>