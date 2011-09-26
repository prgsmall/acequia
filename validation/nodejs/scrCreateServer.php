<?php
include "db.php";

$externalIP=$_SERVER['REMOTE_ADDR'];
$internalIP=$_GET['ip'];
$port=$_GET['port'];

$sql=mysql_query("
DELETE FROM servers
WHERE externalIP='$externalIP'
");

$sql=mysql_query("
INSERT INTO servers
(externalIP,internalIP,port)
VALUES
('$externalIP','$internalIP','$port')
");

if(!$sql){echo "0"; exit();}

echo "1";

?>